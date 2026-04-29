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

function buildApiUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const base = (import.meta?.env?.BASE_URL || '/').replace(/\/+$/, '');
  if (!clean) return `${base || '/'}/`;
  if (!base || base === '/') return `/${clean}`;
  return `${base}/${clean}`;
}

function getApiCandidates(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const primary = `/${clean}`;
  const secondary = buildApiUrl(clean);
  return primary === secondary ? [primary] : [primary, secondary];
}

function safeParseJson(s) {
  try {
    return [true, JSON.parse(stripCodeFences(s))];
  } catch {
    return [false, {}];
  }
}

/** Pull quiz JSON even if the model wrapped it in prose or used a single ```json fence. */
function parseQuizPayload(raw) {
  const text = stripCodeFences(raw || '').trim();
  if (!text) return null;
  try {
    const o = JSON.parse(text);
    if (o && typeof o.reply === 'string') return o;
  } catch { /* try brace extraction */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1));
      if (o && typeof o.reply === 'string') return o;
    } catch { /* ignore */ }
  }
  return null;
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

async function callAI(messages, { maxTokens = 320, temperature = 0.2, requireJson = false } = {}) {
  const body = {
    model: AI_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (requireJson) body.response_format = { type: 'json_object' };

  let lastError = null;
  for (const url of getApiCandidates('api/ai/openai')) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.choices?.[0]?.message?.content || '').trim();
    }

    let detail = '';
    try {
      const text = await res.text();
      detail = text ? `: ${String(text).slice(0, 180)}` : '';
    } catch {
      detail = '';
    }
    lastError = new Error(`AI proxy returned ${res.status}${detail}`);
    if (res.status !== 404) break;
  }
  throw lastError || new Error('AI proxy failed');
}

// ── Analyze Sound ──

export async function analyzeSound(payload) {
  const word = truncate(payload.word || 'Unknown', 64).toUpperCase();
  let freqValues = payload.frequencies || [];
  freqValues = freqValues.slice(0, 80).map(x => clampInt(x, 0, 255, 0));

  // Defaults match the runtime config (FFT_SIZE=2048, sampleRate≈48 kHz on
  // most browsers) so that dominant_hz / hzPerBin reported to the model agree
  // with what the lab actually captured if a payload field is missing.
  const sampleRate = clampFloat(payload.sampleRate, 8000, 96000, 48000);
  const fftSize = clampInt(payload.fftSize, 256, 8192, 2048);
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

  function buildOfflineReport() {
    const pitchText = (metrics.estimated_pitch_hz > 0 && metrics.pitch_clarity >= 0.35)
      ? `The pitch estimate is about ${metrics.estimated_pitch_hz} Hz with moderate confidence.`
      : 'The pitch estimate is uncertain from this snapshot.';

    return {
      summary: `The measured spectrum shows much of its energy in the ${metrics.dominant_region} with a strongest FFT peak near ${metrics.dominant_hz} Hz. ${pitchText}`,
      what_it_means: `The energy split is low=${metrics.energy_distribution.low}%, mid=${metrics.energy_distribution.mid}%, high=${metrics.energy_distribution.high}%. This suggests the sound is ${metrics.peakiness > 2.0 ? 'more tonal' : 'more noise-like'}, and the pitch estimate should be interpreted separately from where FFT energy is concentrated.`,
      try_this: 'Try saying the same vowel at a clearly higher and then lower pitch, and compare both the pitch estimate and the spectrum shape.',
      vocab: { term: 'fundamental frequency', definition: 'The fundamental frequency is the main repeating frequency of a voiced sound and is closely related to perceived pitch.' },
    };
  }

  let raw = '';
  try {
    raw = await callAI(
      [{ role: 'system', content: ANALYZE_SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      { maxTokens: 320, temperature: 0.2, requireJson: true }
    );
  } catch (err) {
    // Network outage / proxy 5xx / non-JSON body. Don't propagate: the README
    // promises a local educational fallback, and capture.js can only show that
    // fallback if analyzeSound returns it instead of throwing.
    console.warn('analyzeSound: AI proxy unreachable, using offline report:', err);
    raw = '';
  }

  const [ok, report] = safeParseJson(raw);
  const finalReport = ok ? report : buildOfflineReport();

  const analysisText = [
    finalReport.summary || '',
    finalReport.what_it_means || '',
    `Try this: ${finalReport.try_this || ''}`,
    `Vocab — ${finalReport.vocab?.term || ''}: ${finalReport.vocab?.definition || ''}`,
  ].join('\n').trim();

  return { metrics, report: finalReport, analysis: analysisText };
}

// ── Dialog (quiz flow) ──

// Heuristic local grader used when /api/ai/openai is unreachable or returns
// non-JSON. Plain text only (the UI does not render Markdown).
function localQuizGrade(transcript, difficulty, currentQuestion) {
  const t = (transcript || '').toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let score = 0.35;
  if (wordCount >= 5) score += 0.1;
  if (wordCount >= 12) score += 0.1;
  if (wordCount >= 24) score += 0.05;

  const TOPICAL = [
    'frequency', 'pitch', 'amplitude', 'spectrum', 'spectral', 'centroid',
    'harmonic', 'harmonics', 'fundamental', 'formant', 'formants', 'resonance',
    'flatness', 'rolloff', 'bandwidth', 'energy', 'tonal', 'noise', 'noisy',
    'vowel', 'consonant', 'voiced', 'unvoiced', 'fft', 'hertz', 'hz',
    'low', 'mid', 'high', 'band', 'wave', 'waveform', 'octave',
  ];
  const hits = TOPICAL.filter(k => t.includes(k));
  score += Math.min(0.3, hits.length * 0.07);
  score = Math.max(0, Math.min(1, score));

  const newDifficulty = score >= 0.75 ? Math.min(5, difficulty + 1)
                       : score <= 0.35 ? Math.max(1, difficulty - 1)
                       : difficulty;

  const qShort = currentQuestion.length > 160 ? `${currentQuestion.slice(0, 157)}...` : currentQuestion;
  const ql = (currentQuestion || '').toLowerCase();

  let coaching = '';
  if (/louder|loudness|volume|amplitude|same word louder/i.test(ql)) {
    coaching = 'Good instinct to compare the same word at different loudness levels. Usually the first change is that the whole pattern gets brighter, while the overall band shape stays fairly similar.';
  } else if (/pitch|higher|lower|fundamental|harmonic/i.test(ql)) {
    coaching = 'Nice direction to think in terms of harmonics. When pitch shifts, harmonic peaks tend to move together while keeping roughly the same spacing pattern.';
  } else if (/noise|tonal|flat|flatness|grainy|whisper/i.test(ql)) {
    coaching = 'A helpful clue: noisy sounds spread energy across many bins, while vowel-like sounds usually form stronger, more focused bands.';
  } else if (/fft|bin|resolution|discrete/i.test(ql)) {
    coaching = 'Think of the FFT as a set of frequency buckets. Each moment is summarized into bins, so you see a sampled snapshot of the spectrum.';
  } else {
    coaching = 'A solid way to answer this is to point to where the energy clusters and explain whether that pattern looks more vowel-like or noise-like.';
  }

  const nudge = wordCount < 6
    ? 'Try giving one concrete visual detail you would look for on the spectrogram.'
    : 'For your next step, name one specific feature you would track on the frequency axis or in band brightness.';

  const reply = [
    coaching,
    '',
    `Question: "${qShort}"`,
    '',
    nudge,
  ].join('\n');

  return {
    reply: reply.trim(),
    score,
    newDifficulty,
    nextQuestion: getNextQuestion(newDifficulty),
  };
}

function localIdkPayload(difficulty) {
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

  // Step 1: Transcribe.
  // Callers may supply `context.transcript` (e.g. from the browser's Web
  // Speech API) so we can run the quiz with no backend at all. Only fall
  // back to the Whisper proxy when no client-side transcript is provided.
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
    if (!payload) {
      payload = localIdkPayload(difficulty);
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

  let raw = '';
  try {
    raw = await callAI(messages, { maxTokens: 380, temperature: 0.3, requireJson: true });
  } catch (err) {
    console.warn('dialog: AI proxy unreachable, using local quiz grader:', err);
    raw = '';
  }

  let payload = parseQuizPayload(raw);
  if (!payload) {
    if (raw && String(raw).trim().length > 0) {
      console.warn('dialog: quiz response was not valid JSON; first 280 chars:', String(raw).slice(0, 280));
    }
    payload = localQuizGrade(transcript, difficulty, currentQuestion);
  }

  const score = clampFloat(payload.score, 0.0, 1.0, 0.5);
  const newDifficulty = clampInt(payload.newDifficulty, 1, 5, difficulty);
  const reply = truncate(payload.reply || 'Something went wrong parsing the tutor reply — please try again.', 2000);
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
