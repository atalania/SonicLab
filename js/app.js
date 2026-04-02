import { state } from './state.js';
import { el, liveCtx, mysteryCtx, fitCanvas } from './dom.js';
import { showStatus, updateProgress, updateStats } from './ui.js';
import { initAudio, updateFreqAxisLabels } from './audio.js';
import { captureWord, savePendingCapture, closeLabelModal } from './capture.js';
import { addToGallery, closeAnalysisModal } from './gallery.js';
import { startRound, redrawMystery } from './challenge.js';
import { unlockAudioForiOS, startRecording, stopRecordingAndSend } from './dialog.js';
import { loadFromLocalStorage, clearSavedData } from './storage.js';
import { initPortal, fireLabStart } from './portal.js';

// ── Navigation ───────────────────────────────────────

function switchToChallenge() {
  state.autoCapture.enabled = false;
  el.autoBtn.textContent = '🤖 Auto: OFF';
  el.wordInput.disabled = false;
  state.pendingCapture = null;
  closeLabelModal();

  el.labSection.style.display = 'none';
  el.challengeSection.style.display = 'flex';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    fitCanvas(el.mysteryCanvas, mysteryCtx);
    fitCanvas(el.liveCanvas, liveCtx);
    state.totalRounds = 0;
    state.score = 0;
    startRound();
  }));
}

function switchToLab() {
  el.challengeSection.style.display = 'none';
  el.labSection.style.display = '';
  state.currentTarget = null;
  fireLabStart();
  requestAnimationFrame(() => {
    fitCanvas(el.liveCanvas, liveCtx);
    fitCanvas(el.mysteryCanvas, mysteryCtx);
  });
}

// ── Resize ───────────────────────────────────────────

window.addEventListener('resize', () => {
  fitCanvas(el.liveCanvas, liveCtx);
  fitCanvas(el.mysteryCanvas, mysteryCtx);
  if (el.challengeSection.style.display === 'flex') redrawMystery();
  updateFreqAxisLabels();
});

// ── Event Listeners ──────────────────────────────────

el.startBtn.addEventListener('click', initAudio);
el.captureBtn.addEventListener('click', captureWord);
el.goToChallengeBtn.addEventListener('click', switchToChallenge);
el.backToLabBtn.addEventListener('click', switchToLab);
el.nextBtn.addEventListener('click', startRound);

el.autoBtn.addEventListener('click', () => {
  state.autoCapture.enabled = !state.autoCapture.enabled;
  el.autoBtn.textContent = state.autoCapture.enabled ? '🤖 Auto: ON' : '🤖 Auto: OFF';
  el.wordInput.disabled  = state.autoCapture.enabled;
  el.captureBtn.disabled = state.autoCapture.enabled;

  showStatus(
    state.autoCapture.enabled
      ? 'Auto Capture ON — speak a word and I\'ll freeze it for labeling.'
      : 'Auto Capture OFF — use manual Capture.',
    'info'
  );

  Object.assign(state.autoCapture, {
    inSpeech: false, speechFrames: 0, silenceFrames: 0,
    peak: 0, baseline: 0, cooldownUntil: 0
  });
});

// ── Label Modal ──────────────────────────────────────

el.modalRetryBtn.addEventListener('click', () => {
  state.pendingCapture = null;
  closeLabelModal();
});

el.modalCancelBtn.addEventListener('click', () => {
  state.pendingCapture = null;
  state.autoCapture.enabled = false;
  el.autoBtn.textContent = '🤖 Auto: OFF';
  el.wordInput.disabled = false;
  el.captureBtn.disabled = false;
  closeLabelModal();
});

el.modalSaveBtn.addEventListener('click', () => {
  const word = el.modalWordInput.value.toUpperCase().trim();
  if (!word) { alert('Type the word first!'); return; }
  if (state.library.some(item => item.word === word)) {
    alert('That word already exists — use a different one.'); return;
  }
  savePendingCapture(word);
});

el.wordInput.addEventListener('keypress', e => {
  if (e.key === 'Enter' && !el.captureBtn.disabled) captureWord();
});

el.modalWordInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') el.modalSaveBtn.click();
});

// ── Analysis Modal ───────────────────────────────────

el.analysisCloseBtn.addEventListener('click', closeAnalysisModal);
el.analysisModal.addEventListener('click', e => {
  if (e.target === el.analysisModal) closeAnalysisModal();
});

// ── Hold-to-Talk ─────────────────────────────────────

let isRecordingHold = false;

el.talkBtn.addEventListener('pointerdown', async e => {
  e.preventDefault();
  if (!state.ttsUnlocked) unlockAudioForiOS();
  if (isRecordingHold) return;
  isRecordingHold = true;
  try { el.talkBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  await startRecording();
});

async function endHold() {
  if (!isRecordingHold) return;
  isRecordingHold = false;
  await stopRecordingAndSend();
}

el.talkBtn.addEventListener('pointerup',     e => { e.preventDefault(); endHold(); });
el.talkBtn.addEventListener('pointercancel', e => { e.preventDefault(); endHold(); });
el.talkBtn.addEventListener('lostpointercapture', () => endHold());

// ── Reset ────────────────────────────────────────────

el.resetLabBtn.addEventListener('click', () => {
  if (confirm('Delete all captured words and reset progress?')) {
    clearSavedData();
    location.reload();
  }
});

// ── Init ─────────────────────────────────────────────

(async () => {
  const data = await loadFromLocalStorage();
  if (data && data.items.length > 0) {
    for (const item of data.items) {
      state.library.push(item);
      addToGallery(item.word, item.img, state.library.length - 1);
    }
    state.score = data.score;
    state.difficulty = data.difficulty;
    state.points = data.points;
    state.dialogHistory = data.dialogHistory;

    updateProgress();
    updateStats();
    el.statsBar.style.display = 'flex';

    showStatus(`✓ Restored ${data.items.length} word(s) from previous session`, 'success');
    setTimeout(() => showStatus('Ready to capture more words or enter Challenge Mode!', 'info'), 3000);
  }
  initPortal();
  console.log('🧬 Sonic Fingerprint Lab v3.0 — Modular architecture ready');
})();
