const DIFFICULTY_QUESTIONS = {
  1: [
    'What happens to the amplitude when you speak louder?',
    'Which measured frequency range contains the most energy in this spectrum?',
    'Does this spectrum look more tonal or more noise-like?',
  ],
  2: [
    'What does it mean if energy is concentrated in a narrow frequency range?',
    'How might a whisper change the spectrum compared with voiced speech?',
    'Why do vowel sounds often show strong resonant structure?',
  ],
  3: [
    'What does peakiness suggest about tonal versus noisy sounds?',
    'Why can two people saying the same word produce different spectral patterns?',
    'How can resonance shape the spectrum of a vowel?',
  ],
  4: [
    'How do voiced sounds differ from unvoiced sounds in spectral characteristics?',
    'How do formants help distinguish vowel sounds?',
    'Why does the FFT show discrete bins instead of a continuous spectrum?',
  ],
  5: [
    'How would a low-pass filter affect speech intelligibility based on the spectrum?',
    'What spectral features might help distinguish one speaker from another?',
    'Explain the time-frequency resolution trade-off in spectral analysis.',
  ],
};

export function getNextQuestion(difficulty) {
  const questions = DIFFICULTY_QUESTIONS[difficulty] || DIFFICULTY_QUESTIONS[1];
  return questions[Math.floor(Math.random() * questions.length)];
}
