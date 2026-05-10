/** @typedef {{ title: string, text: string }} ConceptCard */

/** Public: map a quiz question line to coaching cards (keyword heuristics). */
export function getQuestionCoaching(questionText) {
  const q = String(questionText || '').toLowerCase();
  /** @type {ConceptCard[]} */
  const cards = [];

  const add = (title, text) => {
    if (!cards.some(c => c.title === title)) cards.push({ title, text });
  };

  if (/louder|loudness|amplitude|volume|energy in this pattern|energy.*pattern/i.test(q)) {
    add(
      'Loudness vs pitch',
      'Loudness is mostly how big the vibrations are (amplitude / energy). The spectrogram often gets brighter overall when you speak louder, but your vocal folds do not have to speed up — so pitch may stay similar.'
    );
  }
  if (/frequency range|most energy|band|bins/i.test(q)) {
    add(
      'Frequency & energy',
      'Frequency (Hz) is how fast air pressure repeats. On the chart, horizontal position is frequency: left ≈ low rumble, right ≈ hiss/sibilance. Brighter color in a band means more energy there right now.'
    );
  }
  if (/pitch|different pitches|higher|lower|fundamental|harmonic/i.test(q)) {
    add(
      'Pitch vs spectrum peaks',
      'Pitch is mainly how fast your vocal folds open and close (fundamental frequency, F0). The FFT picture also shows resonances (formants) and harmonics — strong peaks are not always “the pitch number” by themselves. When you change pitch, harmonic stacks often slide together.'
    );
  }
  if (/vowel|mid-frequency|formant/i.test(q)) {
    add(
      'Vowels & formants',
      'Vowels are shaped by your mouth and throat resonances (formants). They usually put noticeable energy in mid frequencies even though pitch can be high or low.'
    );
  }
  if (/whisper/i.test(q)) {
    add(
      'Whispering',
      'Whispering weakens or removes strong periodic voicing, so the sound is more noise-like on the spectrogram: less clear harmonic stripes, often more breath noise.'
    );
  }
  if (/peak|valley|peaks and valleys/i.test(q)) {
    add(
      'Peaks & valleys',
      'Peaks are frequencies where energy piles up (resonances, harmonics, consonant bursts). Valleys are frequencies that are damped. The pattern is like a fingerprint of the articulators for that moment.'
    );
  }
  if (/voiced|unvoiced|voiceless/i.test(q)) {
    add(
      'Voiced vs unvoiced',
      'Voiced sounds have regular glottal pulses (harmonic structure). Unvoiced fricatives like “s” look more like broadband noise without a clear repeating rate.'
    );
  }
  if (/fft|discrete|bins|continuous/i.test(q)) {
    add(
      'FFT bins',
      'The analyser groups the signal into fixed frequency bins — a sampled snapshot, not infinitely smooth. Bin width trades frequency detail vs timing detail.'
    );
  }
  if (/time-frequency|resolution|trade-off/i.test(q)) {
    add(
      'Time–frequency trade-off',
      'Narrower frequency bins (better pitch detail) need longer time windows, so timing gets blurrier, and vice versa. Mentioning “trade-off” shows you understand that limitation.'
    );
  }
  if (/filter|intelligibility/i.test(q)) {
    add(
      'Filtering',
      'Removing bands can steal consonants or vowel cues. Think about which frequencies carry the energy you see for this word before arguing how clarity would change.'
    );
  }
  if (/speaker|identification/i.test(q)) {
    add(
      'Speaker differences',
      'Different throats and habits change formant positions, noisiness, and timing. Two people saying the same word rarely produce identical spectrograms.'
    );
  }
  if (/unique|signature|pattern recognition/i.test(q)) {
    add(
      'Unique patterns',
      'Compare overall shape: where energy clusters, how wide or narrow peaks are, and how noisy vs tonal it looks compared to your other saved words.'
    );
  }
  if (/centroid|brightness.*spectrum/i.test(q)) {
    add(
      'Spectral centroid',
      'Centroid is the “balance point” of energy on the frequency axis — a simple “how bright is this spectrum?” number. It is not the same as musical pitch.'
    );
  }
  if (/flatness|noise-like|tonal/i.test(q)) {
    add(
      'Spectral flatness',
      'Flatness compares tone-like peaks to noise-like spread. High flatness ≈ more noise-like; low flatness ≈ more tonal / peaky.'
    );
  }
  if (/bandwidth|spread/i.test(q)) {
    add(
      'Spectral bandwidth',
      'Bandwidth describes how spread out energy is around the centroid — narrow vs wide smear on the frequency axis.'
    );
  }
  if (/rolloff/i.test(q)) {
    add(
      'Spectral rolloff',
      'Rolloff marks where most of the energy is contained below a cutoff frequency — useful for “how trebly vs bass-heavy” the snapshot is.'
    );
  }

  if (cards.length === 0) {
    add(
      'How to answer',
      'Restate the question in your own words, pick one idea (pitch, loudness, or spectrum shape), and give one concrete observation you could make from a spectrogram (brighter lows, more hiss on top, harmonic stripes, noisy burst, etc.). It is fine to mention uncertainty — snapshots are short.'
    );
  }

  return cards;
}
