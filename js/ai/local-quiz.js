import { getNextQuestion } from './questions.js';
import { difficultyFromRubricScore } from './scoring.js';

function questionTheme(ql) {
  if (/louder|loudness|volume|\bamplitude\b|same word louder/i.test(ql)) return 'loudness';
  if (/\bpitch\b|higher|lower|fundamental|harmonic/i.test(ql)) return 'pitch';
  if (/noise|tonal|flatness|\bflat\b|grainy|whisper/i.test(ql)) return 'noise';
  if (/fft|\bbin\b|resolution|discrete/i.test(ql)) return 'fft';
  return 'general';
}

function answerMatchesTheme(t, theme) {
  const re = {
    loudness: /\b(amplitude|louder|loudness|volume|energy|brighter|gain|loud)\b/i,
    pitch: /\b(pitch|fundamental|harmonics?\b|harmonic|hertz|\bhz\b|tone|timbre)\b/i,
    noise: /\b(noise|noisy|tonal|flatness|\bflat\b|grainy|whisper|unvoiced)\b/i,
    fft: /\b(fft|bins?\b|resolution|discrete|window|leakage)\b/i,
    general: /\b(spectrum|spectral|frequency|energy|formants?\b|resonance|centroid|vowel|voiced|bandwidth|rolloff)\b/i,
  };
  return re[theme].test(t);
}

/** Count signal-processing terms using word boundaries (avoids "low" inside "hello"). */
function topicalHitCount(t) {
  const tl = (t || '').toLowerCase();
  const re = /\b(frequenc(?:y|ies)|spectr(?:um|al)|spectrogram|centroid|harmonics?|fundamental|formants?|resonance|flatness|rolloff|bandwidth|energy|tonal|nois(?:y|e)|vowels?|consonants?|voiced|unvoiced|fft|hertz|hz|pitch|amplitude|louder|loudness|volume|whisper|bins?|octave|waveforms?|wave|bands?|low|mid|high)\b/g;
  const m = tl.match(re);
  return m ? m.length : 0;
}

function normalizedChatText(transcript) {
  return (transcript || '').trim().toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Greetings / filler that should not be graded as a physics answer. */
function isQuizSmallTalkOrGreeting(norm, topicalHits, wordCount) {
  if (topicalHits >= 2) return false;
  if (topicalHits >= 1 && wordCount >= 5) return false;
  if (!norm) return true;
  if (/^(hi|hey|hello|yo|sup|hiya|howdy|good\s+(morning|afternoon|evening)|greetings)\b/.test(norm)) return true;
  if (/^(thanks|thank you|thx|cheers)\b/.test(norm)) return true;
  if (/^(ok|okay|k|sure|cool|nice|wow|yep|yeah|nope|nah|no|yes)\b/.test(norm)) return true;
  if (/^(uh+|um+|hmm+|hm+|er+|ah+)\b/.test(norm)) return true;
  if (/^(test|testing|mic|microphone|one two|123)\b/.test(norm)) return true;
  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && /^(hi|hey|hello|yo|ok|okay|thanks|thank you|yes|no)\b/.test(norm)) return true;
  return false;
}

// Heuristic local grader when /api/ai/openai is unreachable or returns non-JSON.
// Plain text only (the UI does not render Markdown). Hardened against keyword spam.
export function localQuizGrade(transcript, difficulty, currentQuestion) {
  const t = (transcript || '').toLowerCase();
  const norm = normalizedChatText(transcript);
  const words = t.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const ql = (currentQuestion || '').toLowerCase();
  const theme = questionTheme(ql);

  const hits = topicalHitCount(t);
  const relevant = answerMatchesTheme(t, theme);
  const smallTalk = isQuizSmallTalkOrGreeting(norm, hits, wordCount);
  const offTopic = smallTalk || (hits === 0 && !relevant && wordCount <= 3);

  let score = 0.26;
  if (wordCount >= 4) score += 0.06;
  if (wordCount >= 10) score += 0.06;
  if (wordCount >= 20) score += 0.04;

  score += Math.min(0.12, hits * 0.04);

  if (!relevant) score = Math.min(score, 0.40);
  else score += 0.06;

  if (hits >= 5 && wordCount < 8) {
    score = Math.min(score, 0.52);
  }

  if (offTopic) {
    score = Math.min(score, 0.12);
  }

  score = Math.max(0, Math.min(1, score));

  const nd = difficultyFromRubricScore(score, difficulty);
  const qShort = currentQuestion.length > 160 ? `${currentQuestion.slice(0, 157)}...` : currentQuestion;

  let coaching = '';
  if (offTopic) {
    coaching = [
      'That sounds like a greeting or small talk rather than an answer to the quiz question.',
      '',
      `Question: "${qShort}"`,
      '',
      'When you are ready, answer in one or two sentences using the live spectrum or ideas like amplitude, pitch, formants, or where energy sits across frequency.',
    ].join('\n');
  } else if (relevant && /louder|loudness|volume|amplitude|same word louder/i.test(ql)) {
    coaching = 'Good instinct to compare the same word at different loudness levels. Usually the first change is that the whole pattern gets brighter, while the overall band shape stays fairly similar.';
  } else if (relevant && /pitch|higher|lower|fundamental|harmonic/i.test(ql)) {
    coaching = 'Nice direction to think in terms of harmonics. When pitch shifts, harmonic peaks tend to move together while keeping roughly the same spacing pattern.';
  } else if (relevant && /noise|tonal|flat|flatness|grainy|whisper/i.test(ql)) {
    coaching = 'A helpful clue: noisy sounds spread energy across many bins, while vowel-like sounds usually form stronger, more focused bands.';
  } else if (relevant && /fft|bin|resolution|discrete/i.test(ql)) {
    coaching = 'Think of the FFT as a set of frequency buckets. Each moment is summarized into bins, so you see a sampled snapshot of the spectrum.';
  } else if (relevant) {
    coaching = 'A solid way to answer this is to point to where the energy clusters and explain whether that pattern looks more vowel-like or noise-like.';
  } else {
    coaching = `Your answer does not quite connect to this question yet. Re-read: "${qShort}"`;
  }

  const nudge = offTopic
    ? ''
    : wordCount < 6
      ? 'Try giving one concrete visual detail you would look for on the spectrogram.'
      : 'For your next step, name one specific feature you would track on the frequency axis or in band brightness.';

  const reply = nudge ? [coaching, '', nudge].join('\n') : coaching;

  return {
    reply: reply.trim(),
    score,
    nextQuestion: getNextQuestion(nd),
  };
}

export function localIdkPayload(difficulty) {
  const nd = Math.max(1, difficulty - 1);
  return {
    reply: [
      "That's okay — let's break it down.",
      '',
      'Pitch is roughly how fast your vocal folds vibrate (frequency). Loudness is mostly energy or amplitude — turning the volume up does not automatically push pitch higher.',
      '',
      'On the spectrogram, voiced vowels often show brighter horizontal bands (formants). Consonants can look more scattered or noisy.',
      '',
      'Quick check: if you whisper the same vowel, does pitch usually jump a lot, or stay in a similar range?',
    ].join('\n'),
    score: 0.1,
    newDifficulty: nd,
    nextQuestion: getNextQuestion(nd),
  };
}
