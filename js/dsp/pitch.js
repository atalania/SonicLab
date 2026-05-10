export function detectPitchAutocorrelation(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return { pitchHz: 0, clarity: 0 };

  const minLag = Math.floor(sampleRate / 500);
  const maxLag = Math.floor(sampleRate / 60);
  let bestLag = -1, bestCorr = -Infinity;

  for (let lag = minLag; lag <= Math.min(maxLag, SIZE - 1); lag++) {
    const overlap = SIZE - lag;
    let corr = 0;
    for (let i = 0; i < overlap; i++) corr += buffer[i] * buffer[i + lag];
    corr /= overlap;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  if (bestLag === -1 || bestCorr <= 0) return { pitchHz: 0, clarity: 0 };

  let zeroLag = 0;
  for (let i = 0; i < SIZE; i++) zeroLag += buffer[i] * buffer[i];
  const clarity = zeroLag > 0 ? bestCorr / (zeroLag / SIZE) : 0;

  if (bestLag > 0 && bestLag < SIZE - 1) {
    let y1 = 0, y2 = 0, y3 = 0;
    for (let i = 0; i < SIZE - bestLag - 1; i++) {
      y1 += buffer[i] * buffer[i + bestLag - 1];
      y2 += buffer[i] * buffer[i + bestLag];
      y3 += buffer[i] * buffer[i + bestLag + 1];
    }
    const shift = (y1 - y3) / (2 * (y1 - 2 * y2 + y3));
    if (Number.isFinite(shift) && Math.abs(shift) < 1) {
      return {
        pitchHz: Math.round(sampleRate / (bestLag + shift) * 10) / 10,
        clarity: Math.max(0, Math.min(1, Math.round(clarity * 100) / 100))
      };
    }
  }

  const pitchHz = sampleRate / bestLag;
  return {
    pitchHz: Number.isFinite(pitchHz) ? Math.round(pitchHz * 10) / 10 : 0,
    clarity: Math.max(0, Math.min(1, Math.round(clarity * 100) / 100))
  };
}
