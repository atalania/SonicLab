import { state } from './state.js';
import { el } from './dom.js';

export function showStatus(msg, type = 'info') {
  el.wordHint.textContent = msg;
  if (type === 'loading') el.wordHint.classList.add('loading');
  else el.wordHint.classList.remove('loading');
}

// Tracks the previous library count so the "Dataset complete!" banner only
// fires on the <4 → ≥4 transition, not on every later delete/re-add cycle.
let lastProgressCount = 0;

export function updateProgress() {
  const count = state.library.length;
  el.count.textContent = count;
  el.statWords.textContent = count;
  el.progressBar.style.width = (count / 4 * 100) + '%';
  el.goToChallengeBtn.disabled = count < 4;

  if (count >= 4 && lastProgressCount < 4) {
    el.goToChallengeBtn.style.boxShadow = '0 0 20px rgba(200,80,255,.5)';
    showStatus('✓ Dataset complete! Ready for Challenge Mode.', 'success');
  }
  lastProgressCount = count;
}

export function updateStats() {
  el.statScore.textContent = state.score;
  el.statDifficulty.textContent = state.difficulty;
  el.pts.textContent = state.points;
}

export function updateMeter(pct) {
  el.aiPercent.textContent = pct;
  el.aiMeterBar.style.width = pct + '%';

  if (pct > 80) {
    el.aiMatchText.textContent = '✓ STRONG MATCH — spectral profiles align';
    el.aiMatchText.style.color = 'var(--green)';
  } else if (pct > 50) {
    el.aiMatchText.textContent = '~ PARTIAL MATCH — some spectral similarity detected';
    el.aiMatchText.style.color = 'var(--cyan)';
  } else if (pct > 20) {
    el.aiMatchText.textContent = '? WEAK MATCH — spectral profiles diverge';
    el.aiMatchText.style.color = 'var(--amber)';
  } else {
    el.aiMatchText.textContent = '✕ NO MATCH — different spectral signatures';
    el.aiMatchText.style.color = 'var(--muted)';
  }
}
