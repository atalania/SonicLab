import { state } from '../state.js';
import { el } from '../dom.js';
import { frequencyToNoteName, labelFrequency, generateEducationalNote } from '../dsp.js';
import { escapeHtml, setAnalysisText } from './html-utils.js';
import { drawSpectrumChart } from './spectrum-chart.js';

export function showAnalysisModal(index) {
  const item = state.library[index];
  if (!item) return;

  el.analysisWordTitle.textContent = `Spectral Analysis: "${item.word}"`;

  const sCtx = el.analysisSpectrogram.getContext('2d');
  el.analysisSpectrogram.width = item.img.width;
  el.analysisSpectrogram.height = item.img.height;
  sCtx.drawImage(item.img, 0, 0);

  const f = item.features;
  if (!f) {
    el.analysisFeatures.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:.8rem;">Feature data not available — re-capture this word for full analysis.</div>';
    el.analysisBands.innerHTML = '';
    el.analysisDominant.innerHTML = '';
    el.analysisEducational.innerHTML = '<strong>Note:</strong> Re-capture this word to see full analysis.';
  } else {
    const features = [
      { value: f.pitchHz > 30 ? `${Math.round(f.pitchHz)} Hz` : 'N/A', label: 'Pitch (F0)', desc: 'Fundamental frequency — rate of vocal fold vibration' },
      { value: `${Math.round(f.spectralCentroid)} Hz`, label: 'Spectral Centroid', desc: 'Center of mass of the spectrum — perceived brightness' },
      { value: `${Math.round(f.spectralBandwidth)} Hz`, label: 'Bandwidth', desc: 'Spread of frequency energy — narrow = tonal, wide = noisy' },
      { value: `${Math.round(f.spectralRolloff)} Hz`, label: 'Rolloff (85%)', desc: 'Frequency below which 85% of energy is concentrated' },
      { value: f.spectralFlatness.toFixed(3), label: 'Flatness', desc: 'How noise-like (→1) vs. tonal (→0) the signal is' },
      { value: `${f.rmsDb.toFixed(1)} dB`, label: 'RMS Energy', desc: 'Root mean square amplitude — perceived loudness' },
      { value: f.zcr.toFixed(4), label: 'Zero-Crossing Rate', desc: 'Waveform zero crossings — high for unvoiced/noisy sounds' },
      { value: f.pitchClarity > 0 ? f.pitchClarity.toFixed(2) : 'N/A', label: 'Pitch Clarity', desc: 'Confidence of pitch detection — 1.0 = perfect periodicity' }
    ];

    el.analysisFeatures.innerHTML = features.map(ft =>
      `<div class="feature-card">
        <div class="feature-card__value">${escapeHtml(ft.value)}</div>
        <div class="feature-card__label">${escapeHtml(ft.label)}</div>
        <div class="feature-card__desc">${escapeHtml(ft.desc)}</div>
      </div>`
    ).join('');

    if (f.bandEnergies) {
      el.analysisBands.innerHTML = f.bandEnergies.map(b =>
        `<div class="band-row">
          <span class="band-label">${escapeHtml(b.name)}</span>
          <span class="band-range">${escapeHtml(b.range[0])}–${escapeHtml(b.range[1])} Hz</span>
          <div class="band-bar-track"><div class="band-bar-fill" style="width:${Math.min(100, b.pct * 2)}%;background:${b.color}"></div></div>
          <span class="band-pct">${b.pct.toFixed(1)}%</span>
        </div>`
      ).join('');
    }

    if (f.dominantFreqs?.length) {
      el.analysisDominant.innerHTML = f.dominantFreqs.map(peak => {
        const hz = Math.round(peak.freq);
        return `<li class="dominant-freq-item">
          <span class="freq-badge">${hz} Hz</span>
          <span class="freq-note">${escapeHtml(frequencyToNoteName(hz))}</span>
          <span class="freq-role">${escapeHtml(labelFrequency(hz, f.pitchHz))}</span>
        </li>`;
      }).join('');
    }

    el.analysisEducational.innerHTML = `<strong>What This Means</strong>${escapeHtml(generateEducationalNote(f))}`;
  }

  setAnalysisText(item.analysis);

  el.analysisModal.classList.add('visible');
  requestAnimationFrame(() => drawSpectrumChart(el.analysisSpectrum, item));
}

export function closeAnalysisModal() {
  el.analysisModal.classList.remove('visible');
}
