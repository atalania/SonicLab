/**
 * AI integration: prompts, OpenAI proxy calls, spectral helpers, quiz dialog.
 * Implementation lives in ./ai/ — this file is the public barrel.
 */
export { analyzeSound } from './ai/analyze-sound.js';
export { dialog } from './ai/dialog-flow.js';
export { getNextQuestion } from './ai/questions.js';
export { difficultyFromRubricScore } from './ai/scoring.js';
