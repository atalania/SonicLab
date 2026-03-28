/**
 * Portal integration — sends GameEvent objects to the parent wiki's
 * AssistantProvider via postMessage (Path A from the integration guide).
 *
 * The parent wiki's <GameIframeBridge> listens for messages with
 * type: "ASSISTANT_GAME_EVENT" and routes the payload to the AI tutors.
 */
import { state } from './state.js';

const GAME_ID = 'sonic-lab';
const IDLE_TIMEOUT_MS = 120_000;

let roundStartTime = Date.now();
let challengeHintsUsed = 0;
let idleTimer = null;

// ── Core sender ──────────────────────────────────────

function send(eventData) {
  window.parent.postMessage({
    type: 'ASSISTANT_GAME_EVENT',
    payload: eventData,
  }, '*');
}

function elapsed() {
  return Math.floor((Date.now() - roundStartTime) / 1000);
}

function currentLevel() {
  return state.currentTarget
    ? `challenge-round-${state.totalRounds}`
    : 'lab';
}

// ── Timer helpers ────────────────────────────────────

export function resetTimer() {
  roundStartTime = Date.now();
}

export function resetChallengeHints() {
  challengeHintsUsed = 0;
}

// ── Lab events ───────────────────────────────────────

export function fireLabStart() {
  resetTimer();
  send({
    gameId: GAME_ID,
    levelId: 'lab',
    eventType: 'level_start',
    targetConcept: 'spectral_analysis',
    hintCount: 0,
    timeSpentSeconds: 0,
  });
}

export function fireCaptureComplete(word, features) {
  send({
    gameId: GAME_ID,
    levelId: 'lab',
    eventType: 'correct_submission',
    targetConcept: 'spectral_analysis',
    playerAnswer: word,
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
  send({
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
  resetTimer();
  challengeHintsUsed = 0;
  send({
    gameId: GAME_ID,
    levelId: `challenge-round-${roundNum}`,
    eventType: 'level_start',
    targetConcept: 'spectral_pattern_recognition',
    hintCount: 0,
    timeSpentSeconds: 0,
  });
}

export function fireChallengeCorrect(playerWord) {
  send({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'correct_submission',
    targetConcept: 'spectral_pattern_recognition',
    playerAnswer: playerWord,
    correctAnswer: state.currentTarget?.word,
    hintCount: challengeHintsUsed,
    timeSpentSeconds: elapsed(),
  });
}

export function fireChallengeIncorrect(playerWord, correctWord) {
  send({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'incorrect_submission',
    targetConcept: 'spectral_pattern_recognition',
    mistakeCategory: 'spectral_confusion',
    playerAnswer: playerWord,
    correctAnswer: correctWord,
    hintCount: challengeHintsUsed,
    timeSpentSeconds: elapsed(),
  });
}

export function fireHintViewed() {
  challengeHintsUsed++;
  send({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'hint_request',
    targetConcept: 'spectral_pattern_recognition',
    hintCount: challengeHintsUsed,
    timeSpentSeconds: elapsed(),
  });
}

// ── General events ───────────────────────────────────

export function fireRecapRequest() {
  send({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'recap_request',
    targetConcept: 'spectral_analysis',
    hintCount: challengeHintsUsed,
    timeSpentSeconds: elapsed(),
    additionalContext: {
      wordsCollected: state.library.length,
      score: state.score,
      difficulty: state.difficulty,
      points: state.points,
    },
  });
}

// ── Idle detection ───────────────────────────────────

function onIdle() {
  send({
    gameId: GAME_ID,
    levelId: currentLevel(),
    eventType: 'idle_nudge',
    targetConcept: 'spectral_analysis',
    hintCount: challengeHintsUsed,
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
