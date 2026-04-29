// ============================================================================
// js/portal.js
// Sends game events to the LLNL STEM Games portal via postMessage.
// Works silently when not inside an iframe (standalone dev mode).
// ============================================================================

import { state } from './state.js';

const GAME_ID = 'sonic-fingerprint-lab';
const IDLE_TIMEOUT_MS = 120_000;

let problemStartTime = Date.now();
let hintCount = 0;
let idleTimer = null;
const PORTAL_ORIGIN = (import.meta.env.VITE_PORTAL_ORIGIN || '').trim();

function elapsed() {
  return Math.round((Date.now() - problemStartTime) / 1000);
}

function getTargetOrigin() {
  if (PORTAL_ORIGIN) return PORTAL_ORIGIN;
  try {
    if (document.referrer) {
      const origin = new URL(document.referrer).origin;
      if (origin && origin !== 'null') return origin;
    }
  } catch {
    // Ignore malformed referrer and use same-origin fallback.
  }
  return window.location.origin;
}

function sendToPortal(payload) {
  if (window.parent === window) {
    console.debug('[SonicLab Bridge]', payload.eventType, payload);
    return;
  }
  window.parent.postMessage({ type: 'ASSISTANT_GAME_EVENT', payload }, getTargetOrigin());
}

function currentLevel() {
  return state.currentTarget
    ? `challenge-round-${state.totalRounds}`
    : 'lab';
}

// ── Lab events ───────────────────────────────────────

export function fireLabStart() {
  problemStartTime = Date.now();
  hintCount = 0;
  sendToPortal({
    gameId: GAME_ID,
    levelId: 'lab',
    eventType: 'level_start',
    targetConcept: 'spectral_analysis',
    hintCount: 0,
    timeSpentSeconds: 0,
  });
}

export function fireCaptureComplete(word, features) {
  sendToPortal({
    gameId: GAME_ID,
    levelId: 'lab',
    eventType: 'correct_submission',
    targetConcept: 'spectral_analysis',
    playerAnswer: String(word),
    hintCount: 0,
    timeSpentSeconds: elapsed(),
    additionalContext: features ? {
      pitchHz: features.pitchHz,
      spectralCentroid: features.spectralCentroid,
      spectralBandwidth: features.spectralBandwidth,
      spectralFlatness: features.spectralFlatness,
      rmsDb: features.rmsDb,
    } : undefined,
  });
}

export function fireDatasetComplete() {
  sendToPortal({
    gameId: GAME_ID,
    levelId: 'lab',
    eventType: 'level_complete',
    targetConcept: 'voice_dataset_building',
    hintCount: 0,
    timeSpentSeconds: elapsed(),
    additionalContext: {
      wordsCollected: state.library.length,
      words: state.library.map(w => w.word),
    },
  });
}

// ── Challenge events ─────────────────────────────────

export function fireChallengeStart(roundNum) {
  problemStartTime = Date.now();
  hintCount = 0;
  sendToPortal({
    gameId: GAME_ID,
    levelId: `challenge-round-${roundNum}`,
    eventType: 'level_start',
    targetConcept: 'spectral_pattern_recognition',
    hintCount: 0,
    timeSpentSeconds: 0,
  });
}

export function fireChallengeCorrect(playerWord) {
  sendToPortal({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'correct_submission',
    targetConcept: 'spectral_pattern_recognition',
    playerAnswer: String(playerWord),
    correctAnswer: state.currentTarget?.word != null
      ? String(state.currentTarget.word) : undefined,
    hintCount,
    timeSpentSeconds: elapsed(),
  });
}

export function fireChallengeIncorrect(playerWord, correctWord) {
  sendToPortal({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'incorrect_submission',
    targetConcept: 'spectral_pattern_recognition',
    mistakeCategory: 'spectral_confusion',
    playerAnswer: String(playerWord),
    correctAnswer: String(correctWord),
    hintCount,
    timeSpentSeconds: elapsed(),
  });
}

export function fireHintViewed() {
  hintCount++;
  sendToPortal({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'hint_request',
    targetConcept: 'spectral_pattern_recognition',
    hintCount,
    timeSpentSeconds: elapsed(),
  });
}

// ── Idle detection ───────────────────────────────────

function onIdle() {
  sendToPortal({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'idle_nudge',
    targetConcept: 'spectral_analysis',
    hintCount,
    timeSpentSeconds: elapsed(),
  });
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(onIdle, IDLE_TIMEOUT_MS);
}

// ── Bootstrap ────────────────────────────────────────

export function initPortal() {
  // Listen on a broader set of events so reading the spectrogram, typing into
  // the modal, or moving the mouse counts as activity. Without `input` and
  // `mousemove`, the 2-minute idle timer fired even while the student was
  // actively interacting with the lab.
  ['click', 'keydown', 'pointerdown', 'pointermove', 'input', 'wheel', 'touchmove']
    .forEach(evt => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
  resetIdleTimer();
  fireLabStart();
}
