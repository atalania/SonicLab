import { frequencyToNoteName } from './labels.js';

export function generateEducationalNote(features) {
  const notes = [];
  if (features.pitchHz > 30) {
    const hz = Math.round(features.pitchHz);
    const note = frequencyToNoteName(features.pitchHz);
    if (hz < 150) notes.push(`Fundamental frequency: ${hz} Hz (${note}) — typical adult male range (85–180 Hz). This is the rate at which the vocal folds vibrate.`);
    else if (hz < 260) notes.push(`Fundamental frequency: ${hz} Hz (${note}) — typical adult female range (165–255 Hz). The vocal folds vibrate ${hz} times per second.`);
    else notes.push(`Fundamental frequency: ${hz} Hz (${note}) — a higher register, common in children's voices or falsetto.`);
  }
  if (features.spectralCentroid > 0) {
    const c = Math.round(features.spectralCentroid);
    if (c < 1000) notes.push(`Spectral centroid at ${c} Hz indicates a darker, warmer tonal quality.`);
    else if (c < 2000) notes.push(`Spectral centroid at ${c} Hz shows balanced brightness — typical of natural speech.`);
    else notes.push(`Spectral centroid at ${c} Hz indicates a bright, energetic sound.`);
  }
  if (features.spectralFlatness > 0.3) {
    notes.push(`Spectral flatness of ${features.spectralFlatness.toFixed(3)} is high, indicating noise-like content — common in fricatives or whispers.`);
  } else if (features.spectralFlatness < 0.05) {
    notes.push(`Spectral flatness of ${features.spectralFlatness.toFixed(3)} is very low, indicating a strongly tonal signal with clear harmonics.`);
  }
  if (features.formants.length >= 2) {
    const f1 = Math.round(features.formants[0].freq);
    const f2 = Math.round(features.formants[1].freq);
    notes.push(`Estimated formants: F1 ≈ ${f1} Hz, F2 ≈ ${f2} Hz. Formants define vowel identity — F1 correlates with jaw openness, F2 with tongue position.`);
  }
  if (features.bandEnergies) {
    const max = features.bandEnergies.reduce((a, b) => a.pct > b.pct ? a : b);
    if (max.pct > 30) {
      notes.push(`Dominant energy band: ${max.name} (${max.range[0]}–${max.range[1]} Hz) carrying ${max.pct.toFixed(1)}% of total spectral energy.`);
    }
  }
  return notes.join(' ');
}
