import { callAI } from './client.js';
import { QUIZ_SYSTEM_PROMPT } from './prompts.js';
import { getNextQuestion } from './questions.js';
import {
  clampFloat, clampInt, getApiCandidates, isIdk, parseQuizPayload, truncate,
} from './utils.js';
import { difficultyFromRubricScore, computeBaseQuizPoints, computeMcVoiceBonusPoints } from './scoring.js';
import { localIdkPayload, localQuizGrade } from './local-quiz.js';

export async function dialog(audioBlob, context) {
  const difficulty = clampInt(context.difficulty, 1, 5, 1);
  let totalPoints = clampInt(context.points, 0, 100000, 0);
  const targetWord = truncate(context.targetWord, 64);
  const analysisText = truncate(context.analysisText, 2000);
  let currentQuestion = truncate(context.currentQuestion, 500);

  if (!currentQuestion) currentQuestion = getNextQuestion(difficulty);

  const fft = context.fft;
  const fftPreview = Array.isArray(fft) ? fft.slice(0, 40) : null;
  const history = Array.isArray(context.history) ? context.history : [];

  let transcript = (context.transcript || '').trim();
  if (!transcript) {
    if (!audioBlob) throw new Error('No audio and no pre-supplied transcript');
    const form = new FormData();
    form.append('file', audioBlob, 'audio.webm');
    form.append('model', 'whisper-1');

    try {
      let whisperData = null;
      let whisperOk = false;
      for (const url of getApiCandidates('api/ai/openai/whisper')) {
        const whisperRes = await fetch(url, { method: 'POST', body: form });
        if (whisperRes.ok) {
          whisperData = await whisperRes.json();
          whisperOk = true;
          break;
        }
        if (whisperRes.status !== 404) throw new Error('Whisper request failed');
      }
      if (!whisperOk) throw new Error('Whisper request failed');
      transcript = (whisperData?.text || '').trim();
    } catch (err) {
      console.error('Transcription error:', err);
      throw new Error('Transcription failed');
    }
  }

  if (isIdk(transcript)) {
    const teachPrompt = `You are a physics and signal-processing tutor.
The student said they do not know the answer.

Current difficulty: ${difficulty}
Question: "${currentQuestion}"

Give a short teaching response in STRICT JSON:
{
  "reply": string,
  "score": number,
  "newDifficulty": integer,
  "nextQuestion": string
}

Requirements for "reply":
- Use 5 short steps labeled exactly:
  Step 1:
  Step 2:
  Step 3:
  Step 4:
  Step 5:
- Step 1: Restate the question simply.
- Step 2: Explain the key concept.
- Step 3: Give a speaking-related example.
- Step 4: Give one rule of thumb.
- Step 5: Ask one quick check-for-understanding question.

Scientific rules:
- Distinguish pitch (fundamental frequency) from loudness (amplitude).
- Do not imply louder speech automatically means higher pitch.
- Do not claim an FFT snapshot alone proves exact pitch.
- Keep it high-school friendly and concise.

Set:
- score between 0.0 and 0.2
- newDifficulty to max(1, ${difficulty} - 1)`;

    let raw = '';
    try {
      raw = await callAI(
        [{ role: 'system', content: 'You output STRICT JSON only. No markdown.' }, { role: 'user', content: teachPrompt }],
        { maxTokens: 420, temperature: 0.25, requireJson: true }
      );
    } catch (err) {
      console.warn('dialog (IDK): AI proxy unreachable, using local teaching payload:', err);
      raw = '';
    }

    let payload = parseQuizPayload(raw);
    const usedLocalIdk = !payload;
    if (!payload) {
      payload = localIdkPayload(difficulty);
    }

    const score = clampFloat(payload.score, 0.0, 1.0, 0.1);
    const newDifficulty = difficultyFromRubricScore(score, difficulty);
    const reply = truncate(payload.reply, 2000);
    const nextQuestion = truncate(payload.nextQuestion || getNextQuestion(newDifficulty), 500);

    return {
      transcript,
      reply,
      score,
      pointsEarned: 0,
      mcVoiceBonus: 0,
      pointsDelta: 0,
      pointsReason: 'Student said IDK -> teaching mode (0 pts)',
      totalPoints,
      difficulty: newDifficulty,
      nextQuestion,
      usedLocalGrader: usedLocalIdk,
    };
  }

  const ctxSummary = {
    difficulty,
    totalPoints,
    targetWord: targetWord || null,
    analysisText: analysisText || null,
    fftPreview,
    questionAsked: currentQuestion || null,
  };

  const messages = [{ role: 'system', content: QUIZ_SYSTEM_PROMPT }];

  for (const turn of history.slice(-8)) {
    if (turn && typeof turn === 'object' && turn.role && turn.content) {
      const role = turn.role === 'user' ? 'user' : 'assistant';
      messages.push({ role, content: truncate(turn.content, 1500) });
    }
  }

  messages.push({
    role: 'user',
    content: `Context: ${JSON.stringify(ctxSummary, null, 2)}

Question asked: "${currentQuestion}"

Student's spoken answer: "${transcript}"

Evaluate the answer and respond with STRICT JSON.`,
  });

  let raw = '';
  try {
    raw = await callAI(messages, { maxTokens: 380, temperature: 0.3, requireJson: true });
  } catch (err) {
    console.warn('dialog: AI proxy unreachable, using local quiz grader:', err);
    raw = '';
  }

  let payload = parseQuizPayload(raw);
  let usedLocalGrader = false;
  if (!payload) {
    if (raw && String(raw).trim().length > 0) {
      console.warn('dialog: quiz response was not valid JSON; first 280 chars:', String(raw).slice(0, 280));
    }
    payload = localQuizGrade(transcript, difficulty, currentQuestion);
    usedLocalGrader = true;
  }

  const score = clampFloat(payload.score, 0.0, 1.0, 0.5);
  const newDifficulty = difficultyFromRubricScore(score, difficulty);
  const reply = truncate(payload.reply || 'Something went wrong parsing the tutor reply — please try again.', 2000);
  const nextQuestion = truncate(payload.nextQuestion || getNextQuestion(newDifficulty), 500);

  const pointsEarned = computeBaseQuizPoints(score, difficulty);
  const mcVoiceBonus = computeMcVoiceBonusPoints(score, difficulty, !!context.eligibleMcVoiceBonus);
  const pointsDelta = pointsEarned + mcVoiceBonus;
  totalPoints += pointsDelta;

  return {
    transcript,
    reply,
    score,
    pointsEarned,
    mcVoiceBonus,
    pointsDelta,
    pointsReason: `diff=${difficulty} score=${score.toFixed(2)} base +${pointsEarned}${mcVoiceBonus ? ` combo +${mcVoiceBonus}` : ''}`,
    totalPoints,
    difficulty: newDifficulty,
    nextQuestion,
    usedLocalGrader,
  };
}
