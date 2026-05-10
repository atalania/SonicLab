export function findDominantFrequencies(mags, sampleRate, fftSize, numPeaks = 6) {
  const bw = sampleRate / fftSize;
  const peaks = [];
  for (let i = 3; i < mags.length - 3; i++) {
    if (mags[i] > mags[i - 1] && mags[i] > mags[i + 1] &&
        mags[i] > mags[i - 2] && mags[i] > mags[i + 2]) {
      peaks.push({ freq: i * bw, magnitude: mags[i] });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, numPeaks);
}

export function estimateFormants(mags, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  const win = Math.ceil(300 / bw);
  const smoothed = new Float32Array(mags.length);
  for (let i = 0; i < mags.length; i++) {
    let s = 0, c = 0;
    const lo = Math.max(0, i - win), hi = Math.min(mags.length - 1, i + win);
    for (let j = lo; j <= hi; j++) { s += mags[j]; c++; }
    smoothed[i] = s / c;
  }
  const minB = Math.ceil(200 / bw);
  const maxB = Math.min(mags.length - 1, Math.floor(5000 / bw));
  const formants = [];
  for (let i = minB + 1; i < maxB; i++) {
    if (smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
      formants.push({ freq: i * bw, magnitude: smoothed[i] });
    }
  }
  formants.sort((a, b) => b.magnitude - a.magnitude);
  return formants.slice(0, 4).sort((a, b) => a.freq - b.freq);
}
