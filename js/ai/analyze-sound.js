import { ANALYZE_SYSTEM_PROMPT } from './prompts.js';
import { callAI } from './client.js';
import { analyzeFrequencySpectrum } from './spectrum-metrics.js';
import {
  clampFloat, clampInt, safeParseJson, truncate,
} from './utils.js';

export async function analyzeSound(payload) {
  const word = truncate(payload.word || 'Unknown', 64).toUpperCase();
  let freqValues = payload.frequencies || [];
  freqValues = freqValues.slice(0, 80).map(x => clampInt(x, 0, 255, 0));

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
