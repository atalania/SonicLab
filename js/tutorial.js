/**
 * Interactive STEM primer + in-challenge “question coach” so players can
 * answer oral prompts without prior DSP background.
 */
import { el, isLabMode } from './dom.js';

const NUDGE_KEY = 'sonic-lab-tutorial-nudge-dismissed';

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

function clearSpotlight() {
  document.querySelectorAll('.tutorial-spotlight').forEach(n => n.classList.remove('tutorial-spotlight'));
}

function spotlightSelector(sel) {
  clearSpotlight();
  if (!sel) return;
  const node = document.querySelector(sel);
  if (node) {
    node.classList.add('tutorial-spotlight');
    try {
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch { /* ignore */ }
  }
}

const STEPS = [
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

let stepIndex = 0;
let quizAnswered = false;

function renderQuiz(host, quiz) {
  host.innerHTML = '';
  const feedback = document.createElement('p');
  feedback.className = 'tutorial-quiz-feedback';
  feedback.hidden = true;

  quiz.choices.forEach((choice, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn tutorial-quiz-btn';
    b.textContent = choice.label;
    b.addEventListener('click', () => {
      if (quizAnswered) return;
      quizAnswered = true;
      feedback.hidden = false;
      feedback.textContent = choice.correct ? quiz.win : quiz.lose;
      feedback.className = `tutorial-quiz-feedback ${choice.correct ? 'ok' : 'warn'}`;
      host.querySelectorAll('.tutorial-quiz-btn').forEach(btn => { btn.disabled = true; });
    });
    host.appendChild(b);
  });
  host.appendChild(feedback);
}

function renderStep() {
  const step = STEPS[stepIndex];
  const total = STEPS.length;
  el.tutorialStepMeta.textContent = `Step ${stepIndex + 1} of ${total}`;
  el.tutorialTitle.textContent = step.title;
  el.tutorialBody.innerHTML = step.body;

  const quizHost = el.tutorialBody.querySelector('#tutorial-quiz-host');
  if (quizHost && step.quiz) {
    quizAnswered = false;
    renderQuiz(quizHost, step.quiz);
  }

  if (step.tryText) {
    el.tutorialTry.textContent = step.tryText;
    el.tutorialTryBlock.classList.remove('hidden');
  } else {
    el.tutorialTryBlock.classList.add('hidden');
  }

  spotlightSelector(step.highlight);

  el.tutorialPrev.disabled = stepIndex === 0;
  el.tutorialNext.textContent = stepIndex >= total - 1 ? 'Done' : 'Next →';

  // Do not steal focus on "Try it" steps so mic and controls stay usable.
  if (!step.tryText) {
    try {
      el.tutorialNext.focus();
    } catch { /* ignore */ }
  }
}

function openTutorial(at = 0) {
  stepIndex = Math.max(0, Math.min(at, STEPS.length - 1));
  quizAnswered = false;
  el.tutorialOverlay.classList.remove('hidden');
  renderStep();
}

function closeTutorial() {
  el.tutorialOverlay.classList.add('hidden');
  clearSpotlight();
}

function wireNudge() {
  if (!el.tutorialNudge) return;
  if (localStorage.getItem(NUDGE_KEY)) return;
  el.tutorialNudge.classList.remove('hidden');
  el.tutorialNudgeDismiss?.addEventListener('click', () => {
    localStorage.setItem(NUDGE_KEY, '1');
    el.tutorialNudge.classList.add('hidden');
  });
  el.tutorialNudgeStart?.addEventListener('click', () => {
    localStorage.setItem(NUDGE_KEY, '1');
    el.tutorialNudge.classList.add('hidden');
    openTutorial(0);
  });
}

/** Refresh the expandable coach under “Next Question” (Challenge Mode). */
export function refreshQuestionHelper() {
  if (!el.questionCoachPanel || !el.questionCoachContent) return;
  const q = el.nextQ?.textContent || '';
  if (!q.trim() || /^answer questions by voice/i.test(q)) {
    el.questionCoachContent.innerHTML = '<p class="question-coach__empty">A question will appear here after you pick the correct mystery word and use Hold to Talk, or at the start of a round.</p>';
    return;
  }
  const cards = getQuestionCoaching(q);
  el.questionCoachContent.innerHTML = cards
    .map(
      c => `<article class="concept-card"><h4 class="concept-card__title">${escapeHtml(c.title)}</h4><p class="concept-card__text">${escapeHtml(c.text)}</p></article>`
    )
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wireQuestionCoach() {
  el.questionCoachToggle?.addEventListener('click', () => {
    const panel = el.questionCoachPanel;
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    el.questionCoachToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) refreshQuestionHelper();
  });
  el.questionCoachOpenTutorial?.addEventListener('click', () => {
    if (el.questionCoachPanel) el.questionCoachPanel.hidden = true;
    el.questionCoachToggle?.setAttribute('aria-expanded', 'false');
    openTutorial(0);
  });
}

export function initTutorial() {
  wireNudge();
  wireQuestionCoach();

  const go = () => openTutorial(0);
  el.headerTutorialBtn?.addEventListener('click', go);
  el.labTutorialBtn?.addEventListener('click', go);
  el.challengeTutorialBtn?.addEventListener('click', go);

  el.tutorialClose?.addEventListener('click', closeTutorial);

  el.tutorialPrev?.addEventListener('click', () => {
    if (stepIndex <= 0) return;
    stepIndex--;
    renderStep();
  });

  el.tutorialNext?.addEventListener('click', () => {
    if (stepIndex >= STEPS.length - 1) {
      closeTutorial();
      return;
    }
    stepIndex++;
    renderStep();
  });

  document.addEventListener('keydown', e => {
    if (el.tutorialOverlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTutorial();
    }
    if (e.key === 'ArrowRight' && !el.tutorialNext.disabled) {
      e.preventDefault();
      el.tutorialNext.click();
    }
    if (e.key === 'ArrowLeft' && !el.tutorialPrev.disabled) {
      e.preventDefault();
      el.tutorialPrev.click();
    }
  });

  refreshQuestionHelper();
}

// Re-run coach when returning to challenge with existing question text.
if (typeof MutationObserver !== 'undefined' && el.nextQ) {
  const mo = new MutationObserver(() => {
    if (!isLabMode() && el.questionCoachPanel && !el.questionCoachPanel.hidden) refreshQuestionHelper();
  });
  mo.observe(el.nextQ, { characterData: true, childList: true, subtree: true });
}
