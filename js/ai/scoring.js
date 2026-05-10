import { BASE_POINTS } from './constants.js';

/** Same thresholds as QUIZ_SYSTEM_PROMPT; authoritative in code. */
export function difficultyFromRubricScore(score, difficulty) {
  const s = Math.max(0, Math.min(1, score));
  if (s >= 0.75) return Math.min(5, difficulty + 1);
  if (s <= 0.35) return Math.max(1, difficulty - 1);
  return difficulty;
}

/**
 * Multiplier for base points, aligned with difficulty tiers (mastery from 0.75).
 * Soft partial credit below 0.35; zero below 0.12.
 */
export function scoreToPointMultiplier(score) {
  const s = Math.max(0, Math.min(1, score));
  if (s < 0.12) return 0;
  if (s < 0.35) return 0.18 + 0.32 * ((s - 0.12) / (0.35 - 0.12));
  if (s < 0.60) return 0.50 + 0.30 * ((s - 0.35) / 0.25);
  if (s < 0.75) return 0.80 + 0.20 * ((s - 0.60) / 0.15);
  return 1.0 + 0.25 * Math.min(1, (s - 0.75) / 0.25);
}

export function computeBaseQuizPoints(score, difficulty) {
  const base = BASE_POINTS[difficulty] || 2;
  const mult = scoreToPointMultiplier(score);
  return Math.max(0, Math.min(10, Math.round(base * mult)));
}

export function computeMcVoiceBonusPoints(score, difficulty, eligible) {
  if (!eligible || score < 0.60) return 0;
  const base = BASE_POINTS[difficulty] || 2;
  return Math.max(1, Math.min(6, Math.round(base * 0.4)));
}
