import { FFT_SIZE } from '../config.js';
import { state } from '../state.js';

export function drawSpectrumChart(canvas, item) {
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
