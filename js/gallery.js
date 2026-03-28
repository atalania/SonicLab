import { FFT_SIZE } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';
import { frequencyToNoteName, labelFrequency, generateEducationalNote } from './dsp.js';
import { updateProgress, updateStats } from './ui.js';
import { saveToLocalStorage } from './storage.js';

export function addToGallery(word, snapCanvas, index) {
  if (el.galleryEmpty) el.galleryEmpty.style.display = 'none';

  const card = document.createElement('div');
  card.className = 'capture-card';
  card.setAttribute('data-index', index);

  const del = document.createElement('button');
  del.className = 'card-del';
  del.textContent = '×';
  del.addEventListener('click', e => {
    e.stopPropagation();
    deleteCapture(Number(card.getAttribute('data-index')));
  });

  const mini = document.createElement('canvas');
  mini.width = 140; mini.height = 60;
  mini.getContext('2d').drawImage(snapCanvas, 0, 0, 140, 60);

  const wl = document.createElement('div');
  wl.className = 'capture-card__word';
  wl.textContent = word;

  const ts = document.createElement('div');
  ts.className = 'capture-card__time';
  ts.textContent = state.library[index].timestamp;

  card.append(del, mini, wl, ts);
  card.addEventListener('click', () => showAnalysisModal(Number(card.getAttribute('data-index'))));

  el.gallery.appendChild(card);
}

function deleteCapture(index) {
  if (!confirm(`Delete "${state.library[index]?.word}" from dataset?`)) return;
  state.library.splice(index, 1);

  const cardEl = el.gallery.querySelector(`[data-index="${index}"]`);
  if (cardEl) cardEl.remove();

  [...el.gallery.querySelectorAll('.capture-card')].forEach((c, i) => c.setAttribute('data-index', i));

  if (state.library.length === 0 && el.galleryEmpty) el.galleryEmpty.style.display = 'block';

  if (state.currentTarget && !state.library.includes(state.currentTarget)) {
    el.challengeSection.style.display = 'none';
    el.labSection.style.display = '';
    state.currentTarget = null;
  }

  updateProgress();
  updateStats();
  saveToLocalStorage();
}

// ── Analysis Detail Modal ────────────────────────────

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
        <div class="feature-card__value">${ft.value}</div>
        <div class="feature-card__label">${ft.label}</div>
        <div class="feature-card__desc">${ft.desc}</div>
      </div>`
    ).join('');

    if (f.bandEnergies) {
      el.analysisBands.innerHTML = f.bandEnergies.map(b =>
        `<div class="band-row">
          <span class="band-label">${b.name}</span>
          <span class="band-range">${b.range[0]}–${b.range[1]} Hz</span>
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
          <span class="freq-note">${frequencyToNoteName(hz)}</span>
          <span class="freq-role">${labelFrequency(hz, f.pitchHz)}</span>
        </li>`;
      }).join('');
    }

    el.analysisEducational.innerHTML = `<strong>What This Means</strong>${generateEducationalNote(f)}`;
  }

  el.analysisAiText.innerHTML = item.analysis
    ? `<strong style="font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;display:block;margin-bottom:6px;color:var(--muted);text-transform:uppercase;">AI Analysis</strong>${item.analysis}`
    : '';

  el.analysisModal.classList.add('visible');
  requestAnimationFrame(() => drawSpectrumChart(el.analysisSpectrum, item));
}

export function closeAnalysisModal() {
  el.analysisModal.classList.remove('visible');
}

function drawSpectrumChart(canvas, item) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const mags = item.magnitudes;
  if (!mags?.length) {
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.font = '12px "Share Tech Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('No magnitude data — re-capture for spectrum', w / 2, h / 2);
    return;
  }

  const sr = state.audioCtx?.sampleRate || 48000;
  const binWidth = sr / FFT_SIZE;
  const maxBin = Math.min(mags.length, Math.floor(8000 / binWidth));
  const barW = w / maxBin;

  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  for (let i = 1; i < 5; i++) {
    const y = (i / 5) * (h - 18);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  let maxMag = 0;
  for (let i = 1; i < maxBin; i++) maxMag = Math.max(maxMag, mags[i]);
  if (maxMag === 0) maxMag = 1;

  const chartH = h - 18;
  for (let i = 1; i < maxBin; i++) {
    const norm = mags[i] / maxMag;
    const barH = norm * chartH * 0.92;
    const freq = i * binWidth;
    let hue = freq < 500 ? 200 : freq < 2000 ? 200 - 80 * ((freq - 500) / 1500) : 120 - 60 * Math.min(1, (freq - 2000) / 6000);

    ctx.fillStyle = `hsla(${hue}, 75%, 55%, 0.85)`;
    ctx.fillRect(i * barW, chartH - barH, Math.max(1, barW - 0.5), barH);
  }

  if (item.features?.formants) {
    ctx.strokeStyle = 'rgba(255,170,0,.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const f of item.features.formants) {
      const x = (f.freq / binWidth) * barW;
      if (x > 0 && x < w) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, chartH); ctx.stroke(); }
    }
    ctx.setLineDash([]);
  }

  if (item.features?.pitchHz > 30) {
    const px = (item.features.pitchHz / binWidth) * barW;
    if (px > 0 && px < w) {
      ctx.strokeStyle = 'rgba(255,45,120,.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, chartH); ctx.stroke();
      ctx.fillStyle = 'rgba(255,45,120,.9)';
      ctx.font = '9px "Share Tech Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(`F0: ${Math.round(item.features.pitchHz)} Hz`, px, 10);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = '9px "Share Tech Mono"';
  ctx.textAlign = 'center';
  for (const f of [250, 500, 1000, 2000, 4000, 6000, 8000]) {
    const x = (f / binWidth) * barW;
    if (x > 10 && x < w - 10) ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, h - 3);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,45,120,.5)';
  ctx.fillText('— F0', 4, h - 3);
  ctx.fillStyle = 'rgba(255,170,0,.5)';
  ctx.fillText('┆ Formants', 50, h - 3);
}
