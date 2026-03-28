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

function elapsed() {
  return Math.round((Date.now() - problemStartTime) / 1000);
}

function sendToPortal(payload) {
  if (window.parent === window) {
    console.debug('[SonicLab Bridge]', payload.eventType, payload);
    return;
  }
  window.parent.postMessage({ type: 'ASSISTANT_GAME_EVENT', payload }, '*');
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
  ['click', 'keydown', 'pointerdown'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
  fireLabStart();
}
