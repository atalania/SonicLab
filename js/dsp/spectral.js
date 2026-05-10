export function computeSpectralCentroid(mags, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  let ws = 0, total = 0;
  for (let i = 1; i < mags.length; i++) {
    ws += (i * bw) * mags[i];
    total += mags[i];
  }
  return total > 0 ? ws / total : 0;
}

export function computeSpectralBandwidth(mags, centroid, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  let wv = 0, total = 0;
  for (let i = 1; i < mags.length; i++) {
    const freq = i * bw;
    wv += mags[i] * (freq - centroid) * (freq - centroid);
    total += mags[i];
  }
  return total > 0 ? Math.sqrt(wv / total) : 0;
}

export function computeSpectralRolloff(mags, sampleRate, fftSize, pct = 0.85) {
  const bw = sampleRate / fftSize;
  let totalE = 0;
  for (let i = 0; i < mags.length; i++) totalE += mags[i] * mags[i];
  let cum = 0;
  for (let i = 0; i < mags.length; i++) {
    cum += mags[i] * mags[i];
    if (cum >= pct * totalE) return i * bw;
  }
  return (mags.length - 1) * bw;
}

export function computeSpectralFlatness(mags) {
  let logS = 0, linS = 0, n = 0;
  for (let i = 1; i < mags.length; i++) {
    const m = Math.max(mags[i], 1e-12);
    logS += Math.log(m);
    linS += m;
    n++;
  }
  if (n === 0 || linS === 0) return 0;
  return Math.min(1, Math.max(0, Math.exp(logS / n) / (linS / n)));
}
