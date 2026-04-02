import { state } from './state.js';
import { el, mysteryCtx, fitCanvas } from './dom.js';
import { generateEducationalNote } from './dsp.js';
import { updateMeter, updateStats } from './ui.js';
import { saveToLocalStorage } from './storage.js';
import { fireChallengeStart, fireChallengeCorrect, fireChallengeIncorrect, fireHintViewed } from './portal.js';

const QUESTIONS = {
  1: ['What happens to the spectral pattern when you speak the same word louder?',
      'Which frequency range shows the most energy in this pattern?',
      'How does speaking at different pitches change the spectrum?'],
  2: ['Why do vowel sounds typically show energy in the mid-frequency range?',
      'What causes the peaks and valleys in the frequency spectrum?',
      'How would whispering this word change the spectral pattern?'],
  3: ['Explain the relationship between the fundamental frequency and harmonics.',
      'Why might two different people saying this word create different patterns?',
      'What makes this word\'s spectral signature unique compared to others?'],
  4: ['How do voiced sounds differ from unvoiced sounds in spectral characteristics?',
      'What role do formants play in distinguishing different vowel sounds?',
      'Why does the FFT display discrete bins rather than a continuous spectrum?'],
  5: ['How would filtering affect the intelligibility of this word based on its spectrum?',
      'What spectral features would you use for speaker identification?',
      'Explain the time-frequency resolution trade-off in spectral analysis.']
};

function getInitialQuestion(difficulty) {
  const list = QUESTIONS[difficulty] || QUESTIONS[1];
  return list[Math.floor(Math.random() * list.length)];
}

export function startRound() {
  el.feedback.textContent = '';
  el.feedback.className = 'feedback-box';
  el.nextBtn.classList.add('hidden');
  el.challengeHint.classList.add('hidden');
  el.optionsContainer.innerHTML = '';

  state.currentTarget = state.library[Math.floor(Math.random() * state.library.length)];
  fitCanvas(el.mysteryCanvas, mysteryCtx);
  redrawMystery();

  if (state.totalRounds === 0) {
    el.nextQ.textContent = getInitialQuestion(state.difficulty);
    el.studentTranscript.textContent = '—';
    el.aiReply.textContent = 'Hold the talk button and answer the question above!';
  }

  const decoys = state.library
    .filter(item => item.word !== state.currentTarget.word)
    .sort(() => .5 - Math.random())
    .slice(0, Math.min(2, state.library.length - 1));

  [...[state.currentTarget, ...decoys]].sort(() => .5 - Math.random()).forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = choice.word;
    btn.onclick = () => checkAnswer(choice.word);
    el.optionsContainer.appendChild(btn);
  });

  state.totalRounds++;
  fireChallengeStart(state.totalRounds);
  updateMeter(0);
}

function checkAnswer(word) {
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
  const correct = word === state.currentTarget.word;

  if (correct) {
    state.score++;
    fireChallengeCorrect(word);
    el.feedback.textContent = '✓ CORRECT — Great pattern recognition!';
    el.feedback.className = 'feedback-box correct';
  } else {
    fireChallengeIncorrect(word, state.currentTarget.word);
    el.feedback.textContent = `✕ INCORRECT — The answer was "${state.currentTarget.word}"`;
    el.feedback.className = 'feedback-box incorrect';
    el.challengeHint.classList.remove('hidden');
    fireHintViewed();
    el.hintText.textContent = state.currentTarget.features
      ? generateEducationalNote(state.currentTarget.features)
      : state.currentTarget.analysis;
  }

  el.nextBtn.classList.remove('hidden');
  updateStats();
  saveToLocalStorage();
}

export function redrawMystery() {
  if (!state.currentTarget) return;
  const canvas = el.mysteryCanvas;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  mysteryCtx.clearRect(0, 0, cssW, cssH);

  const src = state.currentTarget.img;
  const scale = Math.min(cssW / src.width, cssH / src.height);
  const dw = src.width * scale, dh = src.height * scale;
  mysteryCtx.drawImage(src, 0, 0, src.width, src.height,
    (cssW - dw) / 2, (cssH - dh) / 2, dw, dh);
}

export function compareLiveToTarget() {
  if (!state.liveFeatures || !state.currentTarget?.features) {
    updateMeter(0);
    return;
  }

  const live = state.liveFeatures;
  const target = state.currentTarget.features;
  if (live.rmsDb < -45) { updateMeter(0); return; }

  const w = { centroid: 0.20, bandwidth: 0.12, rolloff: 0.12, flatness: 0.08, bands: 0.30, pitch: 0.18 };
  let score = 0;

  score += w.centroid  * Math.max(0, 1 - Math.abs(live.spectralCentroid - target.spectralCentroid) / Math.max(target.spectralCentroid, 1) * 3);
  score += w.bandwidth * Math.max(0, 1 - Math.abs(live.spectralBandwidth - target.spectralBandwidth) / Math.max(target.spectralBandwidth, 1) * 3);
  score += w.rolloff   * Math.max(0, 1 - Math.abs(live.spectralRolloff - target.spectralRolloff) / Math.max(target.spectralRolloff, 1) * 3);
  score += w.flatness  * Math.max(0, 1 - Math.abs(live.spectralFlatness - target.spectralFlatness) * 5);

  if (live.bandEnergies && target.bandEnergies) {
    const lp = live.bandEnergies.map(b => b.pct);
    const tp = target.bandEnergies.map(b => b.pct);
    let dot = 0, ma = 0, mb = 0;
    for (let i = 0; i < lp.length; i++) { dot += lp[i] * tp[i]; ma += lp[i] ** 2; mb += tp[i] ** 2; }
    const mag = Math.sqrt(ma) * Math.sqrt(mb);
    score += w.bands * (mag > 0 ? Math.max(0, dot / mag) : 0);
  }

  if (live.pitchHz > 30 && target.pitchHz > 30) {
    score += w.pitch * Math.min(live.pitchHz, target.pitchHz) / Math.max(live.pitchHz, target.pitchHz);
  } else if (live.pitchHz <= 30 && target.pitchHz <= 30) {
    score += w.pitch * 0.5;
  }

  updateMeter(Math.min(100, Math.floor(score * 100)));
}
