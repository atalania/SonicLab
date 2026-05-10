export const STEPS = [
  {
    title: 'What you are looking at',
    body: `<p>This lab turns your voice into a <strong>time–frequency image</strong>: scrolling time downward, frequency across, and brightness for energy.</p>
      <p>You will save four words, then match a hidden snapshot and answer short science questions by voice.</p>`,
    highlight: null,
    tryText: null,
  },
  {
    title: 'Frequency (Hz)',
    body: `<p><strong>Frequency</strong> counts how many cycles of air pressure happen per second, measured in <strong>hertz (Hz)</strong>.</p>
      <ul class="tutorial-list">
        <li>Low Hz → rumble, vowel body, bass energy.</li>
        <li>High Hz → hiss, “s” sounds, breath noise.</li>
      </ul>
      <p>Use the axis under the live spectrum while the mic runs — it maps left-to-right to frequency.</p>`,
    highlight: '#freq-axis',
    tryText: 'Start the mic and hum low, then high, and watch horizontal bands of brightness shift.',
  },
  {
    title: 'The scrolling spectrogram',
    body: `<p>Each vertical slice is an instant spectrum. New slices appear and the image scrolls — recent time is usually toward one edge.</p>
      <p><strong>Important:</strong> this is engineering view, not sheet music. Bright stripes often hint at harmonics or resonances, not a single “note label.”</p>`,
    highlight: '[data-tutorial="live-spectrum"]',
    tryText: 'Say a steady vowel and notice repeating bright horizontal ridges (harmonic structure).',
  },
  {
    title: 'Pitch vs the FFT picture',
    body: `<p><strong>Pitch</strong> is what you hear as high vs low — closely tied to <strong>fundamental frequency (F0)</strong>, how fast vocal folds repeat.</p>
      <p>The <strong>spectrum</strong> can show strong peaks that are <em>resonances or harmonics</em>, not “the pitch dial” by itself. Low-frequency energy does not automatically mean a low speaking pitch.</p>
      <p>When a question asks about pitch, talk about repeating rate / F0; when it asks where energy sits, talk about frequency bands on the plot.</p>`,
    highlight: '#live-readout',
    tryText: 'After the mic is on, compare the Pitch (F0) readout to the overall bright bands — they are related but not identical.',
  },
  {
    title: 'The live readouts (quick glossary)',
    body: `<dl class="tutorial-dl">
      <dt>Pitch (F0)</dt><dd>Estimated vocal-fold rate in Hz when the sound is voiced and clear enough.</dd>
      <dt>Centroid</dt><dd>“Center of mass” of energy on the frequency axis — often called spectral brightness.</dd>
      <dt>Energy</dt><dd>Overall strength of the signal in this frame (related to loudness).</dd>
      <dt>Flatness</dt><dd>Noise-like vs peaky tone — higher ≈ more noise-like.</dd>
      <dt>Bandwidth</dt><dd>How spread out energy is around the centroid.</dd>
      <dt>Rolloff</dt><dd>How much treble energy extends upward vs staying in lower bands.</dd>
    </dl>`,
    highlight: '#live-readout',
    tryText: 'Open any saved card’s analysis modal later for the same ideas on a frozen capture.',
  },
  {
    title: 'Micro-check: loudness',
    body: `<p class="tutorial-quiz-lead">If you only speak the same vowel louder, what usually increases first?</p>
      <div class="tutorial-quiz" id="tutorial-quiz-host"></div>`,
    highlight: null,
    tryText: null,
    quiz: {
      choices: [
        { label: 'Amplitude / energy (brighter spectrogram)', correct: true },
        { label: 'Fundamental frequency must double', correct: false },
      ],
      win: 'Yes — more energy shows up as brighter color; pitch does not have to jump.',
      lose: 'Not quite — loudness tracks amplitude/energy first. Pitch is the repeat rate (Hz) of voicing.',
    },
  },
  {
    title: 'Challenge mode strategy',
    body: `<p>Pick the word whose <strong>overall fingerprint</strong> matches: band brightness, stripe pattern, noisiness, and timing.</p>
      <p>The <strong>Live Voice Match</strong> meter compares your current spectrum to the hidden target — use it as coaching while you think out loud.</p>
      <p class="tutorial-prose-note">Tip: say each saved word once in your head while watching the meter spike on the closest match.</p>`,
    highlight: null,
    tryText: null,
  },
  {
    title: 'Voice quiz: how to answer',
    body: `<p>Read <strong>Next Question</strong>, then hold <strong>Hold to Talk</strong> and answer in plain language — one or two sentences is enough.</p>
      <ul class="tutorial-list">
        <li>Name the concept the question targets (pitch, energy in a band, harmonics, noise vs tone…).</li>
        <li>Tie it to something you could see on a spectrogram.</li>
        <li>It is fine to say what would change if you spoke louder, whispered, or moved pitch.</li>
      </ul>
      <p>In Challenge Mode, expand <strong>What do these terms mean?</strong> under Next Question for hints matched to the current prompt.</p>`,
    highlight: '[data-tutorial="dialog-panel"]',
    tryText: null,
  },
];
