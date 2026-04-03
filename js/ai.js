// ══════════════════════════════════════════════════════
// AI Integration Layer (migrated from Flask backend)
// All prompt logic, spectral analysis, scoring, and
// question generation ported from app.py.
// Calls the portal's /api/ai/openai proxy.
// ══════════════════════════════════════════════════════

const AI_MODEL = 'gpt-4o-mini';

// ── System Prompts ──

const ANALYZE_SYSTEM_PROMPT = `You are a careful physics and signal-processing tutor.

You must output STRICT JSON only. No markdown, no code fences, no extra text.

Important constraints:
- FFT energy distribution and estimated pitch are different measurements.
- Do not infer vocal pitch from FFT bin position alone.
- Do not equate low-frequency energy concentration with low vocal pitch.
- A vowel can show strong low-frequency energy even when spoken at a relatively high pitch.
- Use estimated_pitch_hz only if pitch_clarity is reasonably strong.
- If the evidence is limited, say what the data suggests, not what it proves.`;

const QUIZ_SYSTEM_PROMPT = `You are an interactive physics and signal-processing tutor conducting an oral quiz.

You must return STRICT JSON only in this schema:
{
  "reply": string,
  "score": number,
  "newDifficulty": integer,
  "nextQuestion": string
}

Rules for reply:
- Use exactly 3 bullet points labeled:
  Correct:
  Missing:
  Next step:
- Be concise, specific, and educational.

Scoring rubric:
- 1.0 = correct, clear, and uses appropriate terms
- 0.7 to 0.9 = mostly correct with minor gaps
- 0.4 to 0.6 = partially correct or vague
- 0.0 to 0.3 = incorrect, confused, or off-topic

Difficulty:
- Increase if score >= 0.75
- Decrease if score <= 0.35
- Otherwise keep the same

Scientific accuracy rules:
- Distinguish pitch, loudness, resonance, and noise.
- Do not imply louder speech automatically means higher pitch.
- Do not treat FFT bin position alone as proof of exact vocal pitch.
- If the student's idea is directionally right but imprecise, acknowledge that and correct it.`;

// ── Helpers ──

function clampInt(x, lo, hi, def) {
  const v = parseInt(x, 10);
  return isNaN(v) ? def : Math.max(lo, Math.min(hi, v));
}

function clampFloat(x, lo, hi, def) {
  const v = parseFloat(x);
  return isNaN(v) ? def : Math.max(lo, Math.min(hi, v));
}

function truncate(s, n) {
  return s != null ? String(s).slice(0, n) : '';
}

function stripCodeFences(s) {
  s = (s || '').trim();
  if (s.startsWith('```')) {
    const parts = s.split('```');
    if (parts.length >= 2) {
      s = parts[1].trim();
      if (s.startsWith('json')) s = s.slice(4).trim();
    }
  }
  return s.trim();
}

function safeParseJson(s) {
  try {
    return [true, JSON.parse(stripCodeFences(s))];
  } catch {
    return [false, {}];
  }
}

function isIdk(text) {
  let t = (text || '').trim().toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = [
    "i don't know", "i dont know", "idk", "no idea", "not sure",
    "i'm not sure", "im not sure", "i forgot", "can't remember",
    "cant remember", "i dunno", "dont know"
  ];
  return phrases.some(p => t.includes(p));
}

// ── Spectral Analysis (ported from Python) ──

function analyzeFrequencySpectrum(freqValues, word, sampleRate = 44100, fftSize = 1024) {
  if (!freqValues || freqValues.length === 0) {
    return {
      dominant_bin: 0, dominant_hz: 0, dominant_region: 'unknown',
      avg_amplitude: 0, max_amplitude: 0,
      energy_distribution: { low: 0, mid: 0, high: 0 },
      peakiness: 0, spectral_centroid: 0, spectral_spread: 0,
    };
  }

  const maxAmp = Math.max(...freqValues);
  const domBin = freqValues.indexOf(maxAmp);
  const avgAmp = freqValues.reduce((a, b) => a + b, 0) / freqValues.length;
  const hzPerBin = sampleRate / fftSize;
  const domHz = domBin * hzPerBin;
  const domRegion = domHz < 300 ? 'low-frequency range' : domHz < 1200 ? 'mid-frequency range' : 'high-frequency range';

  const n = freqValues.length;
  const lowE = freqValues.slice(0, Math.floor(n * 0.33)).reduce((a, b) => a + b, 0);
  const midE = freqValues.slice(Math.floor(n * 0.33), Math.floor(n * 0.66)).reduce((a, b) => a + b, 0);
  const highE = freqValues.slice(Math.floor(n * 0.66)).reduce((a, b) => a + b, 0);
  const totalE = lowE + midE + highE;

  const energyDist = totalE > 0
    ? { low: +(lowE / totalE * 100).toFixed(1), mid: +(midE / totalE * 100).toFixed(1), high: +(highE / totalE * 100).toFixed(1) }
    : { low: 0, mid: 0, high: 0 };

  const peakiness = +(maxAmp / (avgAmp + 1e-6)).toFixed(2);

  const weightedSum = freqValues.reduce((s, v, i) => s + i * v, 0);
  const total = freqValues.reduce((a, b) => a + b, 0) + 1e-6;
  const centroid = weightedSum / total;
  const spread = Math.sqrt(freqValues.reduce((s, v, i) => s + ((i - centroid) ** 2) * v, 0) / total);

  return {
    dominant_bin: domBin,
    dominant_hz: +domHz.toFixed(2),
    dominant_region: domRegion,
    avg_amplitude: +avgAmp.toFixed(2),
    max_amplitude: maxAmp,
    energy_distribution: energyDist,
    peakiness,
    spectral_centroid: +centroid.toFixed(2),
    spectral_spread: +spread.toFixed(2),
  };
}

// ── Points System ──

const BASE_POINTS = { 1: 2, 2: 3, 3: 4, 4: 6, 5: 8 };

function computePoints(score, difficulty) {
  const base = BASE_POINTS[difficulty] || 2;
  let mult;
  if (score < 0.35) mult = 0.0;
  else if (score < 0.60) mult = 0.5;
  else if (score < 0.80) mult = 1.0;
  else mult = 1.25;
  return Math.max(0, Math.min(10, Math.round(base * mult)));
}

// ── Question Bank ──

const DIFFICULTY_QUESTIONS = {
  1: [
    'What happens to the amplitude when you speak louder?',
    'Which measured frequency range contains the most energy in this spectrum?',
    'Does this spectrum look more tonal or more noise-like?',
  ],
  2: [
    'What does it mean if energy is concentrated in a narrow frequency range?',
    'How might a whisper change the spectrum compared with voiced speech?',
    'Why do vowel sounds often show strong resonant structure?',
  ],
  3: [
    'What does peakiness suggest about tonal versus noisy sounds?',
    'Why can two people saying the same word produce different spectral patterns?',
    'How can resonance shape the spectrum of a vowel?',
  ],
  4: [
    'How do voiced sounds differ from unvoiced sounds in spectral characteristics?',
    'How do formants help distinguish vowel sounds?',
    'Why does the FFT show discrete bins instead of a continuous spectrum?',
  ],
  5: [
    'How would a low-pass filter affect speech intelligibility based on the spectrum?',
    'What spectral features might help distinguish one speaker from another?',
    'Explain the time-frequency resolution trade-off in spectral analysis.',
  ],
};

export function getNextQuestion(difficulty) {
  const questions = DIFFICULTY_QUESTIONS[difficulty] || DIFFICULTY_QUESTIONS[1];
  return questions[Math.floor(Math.random() * questions.length)];
}

// ── AI Call ──

async function callAI(messages, { maxTokens = 320, temperature = 0.2 } = {}) {
  const res = await fetch('/api/ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// ── Analyze Sound ──

export async function analyzeSound(payload) {
  const word = truncate(payload.word || 'Unknown', 64).toUpperCase();
  let freqValues = payload.frequencies || [];
  freqValues = freqValues.slice(0, 80).map(x => clampInt(x, 0, 255, 0));

  const sampleRate = clampFloat(payload.sampleRate, 8000, 96000, 44100);
  const fftSize = clampInt(payload.fftSize, 256, 8192, 1024);
  const estimatedPitchHz = clampFloat(payload.estimatedPitchHz, 0, 5000, 0);
  const pitchClarity = clampFloat(payload.pitchClarity, 0, 1, 0);

  const metrics = analyzeFrequencySpectrum(freqValues, word, sampleRate, fftSize);
  metrics.estimated_pitch_hz = +estimatedPitchHz.toFixed(2);
  metrics.pitch_clarity = +pitchClarity.toFixed(2);

  const prompt = `Analyze this speech snapshot conservatively for a high-school STEM learner.

The FFT magnitudes describe spectral shape.
The estimated pitch value is a separate fundamental-frequency estimate.
Use both carefully.

Word spoken: "${word}"

FFT magnitudes (0-255), first 40 bins:
${JSON.stringify(freqValues.slice(0, 40))}

Computed metrics:
- Dominant FFT bin: ${metrics.dominant_bin}
- Approx dominant FFT frequency: ${metrics.dominant_hz} Hz
- Dominant FFT region: ${metrics.dominant_region}
- Average amplitude: ${metrics.avg_amplitude}
- Maximum amplitude: ${metrics.max_amplitude}
- Peakiness (max/avg): ${metrics.peakiness}
- Spectral centroid: ${metrics.spectral_centroid}
- Spectral spread: ${metrics.spectral_spread}
- Energy distribution: low=${metrics.energy_distribution.low}%, mid=${metrics.energy_distribution.mid}%, high=${metrics.energy_distribution.high}%
- Estimated fundamental frequency (pitch): ${metrics.estimated_pitch_hz} Hz
- Pitch clarity/confidence: ${metrics.pitch_clarity}

Write a mini lab report in STRICT JSON with this exact schema:
{
  "summary": "One sentence describing the spectrum shape and, if pitch clarity is decent, a cautious statement about estimated pitch.",
  "what_it_means": "One or two sentences about resonance, vowel-like structure, tonal vs noisy sound, and how pitch estimate differs from FFT energy concentration.",
  "try_this": "One short experiment the student can try next.",
  "vocab": {
    "term": "One useful signal-processing term",
    "definition": "One sentence definition"
  }
}

Rules:
- Do not say low-frequency FFT energy automatically means low vocal pitch.
- Treat estimated_pitch_hz as the pitch estimate, not dominant FFT bin.
- If pitch clarity is below 0.35, say the pitch estimate is uncertain.
- Prefer cautious wording like 'suggests', 'appears', or 'is consistent with'.
- Keep the language concise and accurate.
- No praise, no filler, no greetings.`;

  try {
    const raw = await callAI(
      [{ role: 'system', content: ANALYZE_SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      { maxTokens: 320, temperature: 0.2 }
    );

    const [ok, report] = safeParseJson(raw);

    let finalReport;
    if (ok) {
      finalReport = report;
    } else {
      // Fallback
      const pitchText = (metrics.estimated_pitch_hz > 0 && metrics.pitch_clarity >= 0.35)
        ? `The pitch estimate is about ${metrics.estimated_pitch_hz} Hz with moderate confidence.`
        : 'The pitch estimate is uncertain from this snapshot.';

      finalReport = {
        summary: `The measured spectrum shows much of its energy in the ${metrics.dominant_region} with a strongest FFT peak near ${metrics.dominant_hz} Hz. ${pitchText}`,
        what_it_means: `The energy split is low=${metrics.energy_distribution.low}%, mid=${metrics.energy_distribution.mid}%, high=${metrics.energy_distribution.high}%. This suggests the sound is ${metrics.peakiness > 2.0 ? 'more tonal' : 'more noise-like'}, and the pitch estimate should be interpreted separately from where FFT energy is concentrated.`,
        try_this: 'Try saying the same vowel at a clearly higher and then lower pitch, and compare both the pitch estimate and the spectrum shape.',
        vocab: { term: 'fundamental frequency', definition: 'The fundamental frequency is the main repeating frequency of a voiced sound and is closely related to perceived pitch.' },
      };
    }

    const analysisText = [
      finalReport.summary || '',
      finalReport.what_it_means || '',
      `Try this: ${finalReport.try_this || ''}`,
      `Vocab — ${finalReport.vocab?.term || ''}: ${finalReport.vocab?.definition || ''}`,
    ].join('\n').trim();

    return { metrics, report: finalReport, analysis: analysisText };
  } catch (err) {
    console.error('analyzeSound error:', err);
    throw err;
  }
}

// ── Dialog (quiz flow) ──

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

  // Step 1: Transcribe audio via Whisper proxy
  const form = new FormData();
  form.append('file', audioBlob, 'audio.webm');
  form.append('model', 'whisper-1');

  let transcript;
  try {
    const whisperRes = await fetch('/api/ai/openai/whisper', { method: 'POST', body: form });
    if (!whisperRes.ok) throw new Error('Whisper request failed');
    const whisperData = await whisperRes.json();
    transcript = (whisperData.text || '').trim();
  } catch (err) {
    console.error('Transcription error:', err);
    throw new Error('Transcription failed');
  }

  // Step 2: Handle "I don't know" responses
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

    const raw = await callAI(
      [{ role: 'system', content: 'You output STRICT JSON only. No markdown.' }, { role: 'user', content: teachPrompt }],
      { maxTokens: 420, temperature: 0.25 }
    );

    let [ok, payload] = safeParseJson(raw);
    if (!ok) {
      payload = {
        reply: "Step 1: The question is asking about a sound feature in simple terms.\nStep 2: The key idea is that pitch, loudness, and spectrum are related but not identical.\nStep 3: For example, speaking louder usually raises amplitude, but not necessarily pitch.\nStep 4: Rule of thumb: pitch relates to frequency, loudness relates to amplitude.\nStep 5: What usually changes first when you speak louder: amplitude or pitch?",
        score: 0.1,
        newDifficulty: Math.max(1, difficulty - 1),
        nextQuestion: getNextQuestion(Math.max(1, difficulty - 1)),
      };
    }

    const score = clampFloat(payload.score, 0.0, 1.0, 0.1);
    const newDifficulty = clampInt(payload.newDifficulty, 1, 5, Math.max(1, difficulty - 1));
    const reply = truncate(payload.reply, 2000);
    const nextQuestion = truncate(payload.nextQuestion || getNextQuestion(newDifficulty), 500);

    return {
      transcript,
      reply,
      score,
      pointsEarned: 0,
      pointsReason: 'Student said IDK -> teaching mode (0 pts)',
      totalPoints,
      difficulty: newDifficulty,
      nextQuestion,
    };
  }

  // Step 3: Normal quiz evaluation
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

  const raw = await callAI(messages, { maxTokens: 380, temperature: 0.3 });
  let [ok, payload] = safeParseJson(raw);

  if (!ok) {
    payload = {
      reply: "Correct: You attempted an answer related to the question.\nMissing: Add one more precise physics or signal-processing detail.\nNext step: Use one specific term such as amplitude, resonance, or harmonics.",
      score: 0.5,
      newDifficulty: difficulty,
      nextQuestion: getNextQuestion(difficulty),
    };
  }

  const score = clampFloat(payload.score, 0.0, 1.0, 0.5);
  const newDifficulty = clampInt(payload.newDifficulty, 1, 5, difficulty);
  const reply = truncate(payload.reply || 'Correct: —\nMissing: —\nNext step: —', 2000);
  const nextQuestion = truncate(payload.nextQuestion || getNextQuestion(newDifficulty), 500);

  const pointsEarned = computePoints(score, difficulty);
  totalPoints += pointsEarned;

  return {
    transcript,
    reply,
    score,
    pointsEarned,
    pointsReason: `diff=${difficulty} score=${score.toFixed(2)} -> +${pointsEarned}`,
    totalPoints,
    difficulty: newDifficulty,
    nextQuestion,
  };
}
