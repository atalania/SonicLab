export function frequencyToNoteName(freq) {
  if (freq <= 0) return '';
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const semi = 12 * Math.log2(freq / 440);
  const idx = Math.round(semi) + 69;
  if (idx < 0 || idx > 127) return '';
  return names[idx % 12] + (Math.floor(idx / 12) - 1);
}

export function labelFrequency(freq, f0) {
  const ord = n => n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  if (f0 > 30) {
    if (Math.abs(freq - f0) < f0 * 0.06) return 'Fundamental (F0)';
    for (let h = 2; h <= 10; h++) {
      if (Math.abs(freq - f0 * h) < f0 * 0.08) return `${h}${ord(h)} harmonic`;
    }
  }
  if (freq >= 200 && freq <= 900) return 'Formant region (F1)';
  if (freq >= 900 && freq <= 2500) return 'Formant region (F2)';
  if (freq >= 2500 && freq <= 3500) return 'Formant region (F3)';
  return frequencyToNoteName(freq);
}
