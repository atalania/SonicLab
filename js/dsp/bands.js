import { FREQ_BANDS } from '../config.js';

export function computeBandEnergies(mags, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  let totalE = 0;
  for (let i = 0; i < mags.length; i++) totalE += mags[i] * mags[i];
  return FREQ_BANDS.map(band => {
    const s = Math.max(0, Math.floor(band.range[0] / bw));
    const e = Math.min(mags.length, Math.ceil(band.range[1] / bw));
    let energy = 0;
    for (let i = s; i < e; i++) energy += mags[i] * mags[i];
    return { ...band, energy, pct: totalE > 0 ? (energy / totalE * 100) : 0 };
  });
}
