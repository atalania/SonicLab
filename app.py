"""
STEM Voice Recognition Game - Backend
====================================
Features:
- /analyze-sound returns structured FFT mini-lab reports
- /dialog handles oral quiz flow with deterministic points
- safer JSON parsing + fallbacks
- optional TTS support
- Render / Gunicorn friendly

ENV VARS:
- OPENAI_API_KEY (required)
- FRONTEND_ORIGINS (comma-separated allowed origins for CORS)
- ENABLE_TTS ("1" to enable, else off)
"""

import os
import json
import base64
import traceback
import logging
import re
import random
from typing import Any, Dict, List, Tuple
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded

from openai import OpenAI

# =========================================================
# Logging
# =========================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# =========================================================
# Flask App
# =========================================================
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 3 * 1024 * 1024  # 3 MB for audio files

# =========================================================
# CORS
# =========================================================
FRONTEND_ORIGINS = os.environ.get("FRONTEND_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in FRONTEND_ORIGINS.split(",") if o.strip()]

if ALLOWED_ORIGINS:
    CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})
    logger.info(f"CORS enabled for origins: {ALLOWED_ORIGINS}")
else:
    CORS(app, resources={r"/*": {"origins": []}})
    logger.warning("No CORS origins configured - cross-origin requests blocked")

# =========================================================
# Rate Limiting
# =========================================================
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["500 per hour"],
    storage_uri="memory://",
)


@app.errorhandler(RateLimitExceeded)
def handle_ratelimit(e):
    logger.warning(f"Rate limit exceeded for {get_remote_address()}")
    return jsonify({"error": "Rate limit exceeded. Please try again soon."}), 429


@app.errorhandler(413)
def handle_large_file(e):
    return jsonify({"error": "File too large. Maximum 3MB allowed."}), 413


# =========================================================
# OpenAI Client
# =========================================================
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    logger.error("OPENAI_API_KEY environment variable not set!")
    raise ValueError("OPENAI_API_KEY must be set in environment variables")

client = OpenAI(api_key=api_key)
ENABLE_TTS = os.environ.get("ENABLE_TTS", "0") == "1"
logger.info(f"OpenAI client initialized. TTS enabled: {ENABLE_TTS}")

# =========================================================
# Prompt Constants
# =========================================================
ANALYZE_SYSTEM_PROMPT = """
You are a careful physics and signal-processing tutor.

You must output STRICT JSON only. No markdown, no code fences, no extra text.

Important constraints:
- FFT energy distribution and estimated pitch are different measurements.
- Do not infer vocal pitch from FFT bin position alone.
- Do not equate low-frequency energy concentration with low vocal pitch.
- A vowel can show strong low-frequency energy even when spoken at a relatively high pitch.
- Use estimated_pitch_hz only if pitch_clarity is reasonably strong.
- If the evidence is limited, say what the data suggests, not what it proves.
""".strip()

QUIZ_SYSTEM_PROMPT = """
You are an interactive physics and signal-processing tutor conducting an oral quiz.

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
- If the student's idea is directionally right but imprecise, acknowledge that and correct it.
""".strip()

# =========================================================
# Helpers
# =========================================================
def safe_json() -> Dict[str, Any]:
    try:
        return request.get_json(silent=True) or {}
    except Exception as e:
        logger.error(f"Error parsing JSON: {e}")
        return {}


def truncate(s: Any, n: int) -> str:
    return str(s)[:n] if s is not None else ""


def clamp_int(x: Any, lo: int, hi: int, default: int) -> int:
    try:
        v = int(x)
        return max(lo, min(hi, v))
    except (TypeError, ValueError):
        return default


def clamp_float(x: Any, lo: float, hi: float, default: float) -> float:
    try:
        v = float(x)
        return max(lo, min(hi, v))
    except (TypeError, ValueError):
        return default


def validate_frequencies(freq_values: Any) -> Tuple[bool, List[int]]:
    if not isinstance(freq_values, list):
        return False, []
    try:
        sanitized = [clamp_int(x, 0, 255, 0) for x in freq_values[:80]]
        return True, sanitized
    except Exception:
        return False, []


def strip_code_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        parts = s.split("```")
        if len(parts) >= 2:
            s = parts[1].strip()
            if s.startswith("json"):
                s = s[4:].strip()
    return s.strip()


def safe_parse_json(s: str) -> Tuple[bool, Dict[str, Any]]:
    try:
        s2 = strip_code_fences(s)
        return True, json.loads(s2)
    except Exception:
        return False, {}


def is_idk(text: str) -> bool:
    t = (text or "").strip().lower()
    t = re.sub(r"[^a-z0-9\s']", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    phrases = [
        "i don't know", "i dont know", "idk", "no idea", "not sure",
        "i'm not sure", "im not sure", "i forgot", "can't remember",
        "cant remember", "i dunno", "dont know"
    ]
    return any(p in t for p in phrases)

# =========================================================
# Spectral Metrics
# =========================================================
def analyze_frequency_spectrum(
    freq_values: List[int],
    word: str,
    sample_rate: float = 44100,
    fft_size: int = 1024
) -> Dict[str, Any]:
    if not freq_values:
        return {
            "dominant_bin": 0,
            "dominant_hz": 0,
            "dominant_region": "unknown",
            "avg_amplitude": 0,
            "max_amplitude": 0,
            "energy_distribution": {"low": 0, "mid": 0, "high": 0},
            "peakiness": 0,
            "spectral_centroid": 0,
            "spectral_spread": 0,
        }

    max_amplitude = max(freq_values)
    dominant_bin = freq_values.index(max_amplitude)
    avg_amplitude = sum(freq_values) / len(freq_values)

    hz_per_bin = sample_rate / fft_size
    dominant_hz = dominant_bin * hz_per_bin

    if dominant_hz < 300:
        dominant_region = "low-frequency range"
    elif dominant_hz < 1200:
        dominant_region = "mid-frequency range"
    else:
        dominant_region = "high-frequency range"

    total_bins = len(freq_values)

    low_energy = sum(freq_values[: int(total_bins * 0.33)])
    mid_energy = sum(freq_values[int(total_bins * 0.33): int(total_bins * 0.66)])
    high_energy = sum(freq_values[int(total_bins * 0.66):])

    total_energy = low_energy + mid_energy + high_energy
    if total_energy > 0:
        energy_distribution = {
            "low": round(low_energy / total_energy * 100, 1),
            "mid": round(mid_energy / total_energy * 100, 1),
            "high": round(high_energy / total_energy * 100, 1),
        }
    else:
        energy_distribution = {"low": 0, "mid": 0, "high": 0}

    peakiness = round(max_amplitude / (avg_amplitude + 1e-6), 2)

    weighted_sum = sum(i * v for i, v in enumerate(freq_values))
    total = sum(freq_values) + 1e-6
    centroid = weighted_sum / total

    spread = (sum(((i - centroid) ** 2) * v for i, v in enumerate(freq_values)) / total) ** 0.5

    return {
        "dominant_bin": int(dominant_bin),
        "dominant_hz": round(dominant_hz, 2),
        "dominant_region": dominant_region,
        "avg_amplitude": round(avg_amplitude, 2),
        "max_amplitude": int(max_amplitude),
        "energy_distribution": energy_distribution,
        "peakiness": peakiness,
        "spectral_centroid": round(centroid, 2),
        "spectral_spread": round(spread, 2),
    }


def generate_lab_report_prompt(word: str, freq_values: List[int], m: Dict[str, Any]) -> str:
    return f"""
Analyze this speech snapshot conservatively for a high-school STEM learner.

The FFT magnitudes describe spectral shape.
The estimated pitch value is a separate fundamental-frequency estimate.
Use both carefully.

Word spoken: "{word}"

FFT magnitudes (0-255), first 40 bins:
{freq_values[:40]}

Computed metrics:
- Dominant FFT bin: {m['dominant_bin']}
- Approx dominant FFT frequency: {m['dominant_hz']} Hz
- Dominant FFT region: {m['dominant_region']}
- Average amplitude: {m['avg_amplitude']}
- Maximum amplitude: {m['max_amplitude']}
- Peakiness (max/avg): {m['peakiness']}
- Spectral centroid: {m['spectral_centroid']}
- Spectral spread: {m['spectral_spread']}
- Energy distribution: low={m['energy_distribution']['low']}%, mid={m['energy_distribution']['mid']}%, high={m['energy_distribution']['high']}%
- Estimated fundamental frequency (pitch): {m.get('estimated_pitch_hz', 0)} Hz
- Pitch clarity/confidence: {m.get('pitch_clarity', 0)}

Write a mini lab report in STRICT JSON with this exact schema:
{{
  "summary": "One sentence describing the spectrum shape and, if pitch clarity is decent, a cautious statement about estimated pitch.",
  "what_it_means": "One or two sentences about resonance, vowel-like structure, tonal vs noisy sound, and how pitch estimate differs from FFT energy concentration.",
  "try_this": "One short experiment the student can try next.",
  "vocab": {{
    "term": "One useful signal-processing term",
    "definition": "One sentence definition"
  }}
}}

Rules:
- Do not say low-frequency FFT energy automatically means low vocal pitch.
- Treat estimated_pitch_hz as the pitch estimate, not dominant FFT bin.
- If pitch clarity is below 0.35, say the pitch estimate is uncertain.
- Prefer cautious wording like 'suggests', 'appears', or 'is consistent with'.
- Keep the language concise and accurate.
- No praise, no filler, no greetings.
""".strip()

# =========================================================
# Deterministic Points
# =========================================================
def compute_points(score: float, difficulty: int) -> int:
    base_map = {1: 2, 2: 3, 3: 4, 4: 6, 5: 8}
    base = base_map.get(difficulty, 2)

    if score < 0.35:
        mult = 0.0
    elif score < 0.60:
        mult = 0.5
    elif score < 0.80:
        mult = 1.0
    else:
        mult = 1.25

    pts = int(round(base * mult))
    return max(0, min(10, pts))


def get_next_question(difficulty: int) -> str:
    DIFFICULTY_QUESTIONS = {
        1: [
            "What happens to the amplitude when you speak louder?",
            "Which measured frequency range contains the most energy in this spectrum?",
            "Does this spectrum look more tonal or more noise-like?",
        ],
        2: [
            "What does it mean if energy is concentrated in a narrow frequency range?",
            "How might a whisper change the spectrum compared with voiced speech?",
            "Why do vowel sounds often show strong resonant structure?",
        ],
        3: [
            "What does peakiness suggest about tonal versus noisy sounds?",
            "Why can two people saying the same word produce different spectral patterns?",
            "How can resonance shape the spectrum of a vowel?",
        ],
        4: [
            "How do voiced sounds differ from unvoiced sounds in spectral characteristics?",
            "How do formants help distinguish vowel sounds?",
            "Why does the FFT show discrete bins instead of a continuous spectrum?",
        ],
        5: [
            "How would a low-pass filter affect speech intelligibility based on the spectrum?",
            "What spectral features might help distinguish one speaker from another?",
            "Explain the time-frequency resolution trade-off in spectral analysis.",
        ],
    }
    questions = DIFFICULTY_QUESTIONS.get(difficulty, DIFFICULTY_QUESTIONS[1])
    return random.choice(questions)

# =========================================================
# Routes
# =========================================================
@app.route("/", methods=["GET"])
def serve_index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(os.path.join(STATIC_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(os.path.join(STATIC_DIR, "js"), filename)


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify(
        {
            "status": "online",
            "service": "STEM Voice Recognition Lab",
            "version": "4.0",
            "timestamp": datetime.utcnow().isoformat(),
        }
    ), 200


@app.route("/analyze-sound", methods=["POST"])
@limiter.limit("60 per minute")
def analyze_sound():
    try:
        data = safe_json()
        word = truncate(data.get("word", "Unknown"), 64).upper()
        freq_values = data.get("frequencies", [])

        is_valid, freq_values = validate_frequencies(freq_values)
        if not is_valid:
            return jsonify({"error": "Invalid frequency data. Must be array of numbers."}), 400

        sample_rate = clamp_float(data.get("sampleRate", 44100), 8000, 96000, 44100)
        fft_size = clamp_int(data.get("fftSize", 1024), 256, 8192, 1024)
        estimated_pitch_hz = clamp_float(data.get("estimatedPitchHz", 0), 0, 5000, 0)
        pitch_clarity = clamp_float(data.get("pitchClarity", 0), 0, 1, 0)

        metrics = analyze_frequency_spectrum(freq_values, word, sample_rate, fft_size)
        metrics["estimated_pitch_hz"] = round(estimated_pitch_hz, 2)
        metrics["pitch_clarity"] = round(pitch_clarity, 2)
        prompt = generate_lab_report_prompt(word, freq_values, metrics)

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            max_tokens=320,
            messages=[
                {"role": "system", "content": ANALYZE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )

        raw = (completion.choices[0].message.content or "").strip()
        ok, report = safe_parse_json(raw)

        if not ok:
            pitch_hz = metrics.get("estimated_pitch_hz", 0)
            pitch_clarity = metrics.get("pitch_clarity", 0)

            if pitch_hz > 0 and pitch_clarity >= 0.35:
                pitch_text = f"The pitch estimate is about {pitch_hz} Hz with moderate confidence."
            else:
                pitch_text = "The pitch estimate is uncertain from this snapshot."

            report = {
                "summary": (
                    f"The measured spectrum shows much of its energy in the {metrics['dominant_region']} "
                    f"with a strongest FFT peak near {metrics['dominant_hz']} Hz. {pitch_text}"
                ),
                "what_it_means": (
                    f"The energy split is low={metrics['energy_distribution']['low']}%, "
                    f"mid={metrics['energy_distribution']['mid']}%, high={metrics['energy_distribution']['high']}%. "
                    f"This suggests the sound is {'more tonal' if metrics['peakiness'] > 2.0 else 'more noise-like'}, "
                    f"and the pitch estimate should be interpreted separately from where FFT energy is concentrated."
                ),
                "try_this": "Try saying the same vowel at a clearly higher and then lower pitch, and compare both the pitch estimate and the spectrum shape.",
                "vocab": {
                    "term": "fundamental frequency",
                    "definition": "The fundamental frequency is the main repeating frequency of a voiced sound and is closely related to perceived pitch."
                },
            }

        analysis_text = (
            f"{report.get('summary', '')}\n"
            f"{report.get('what_it_means', '')}\n"
            f"Try this: {report.get('try_this', '')}\n"
            f"Vocab — {report.get('vocab', {}).get('term', '')}: {report.get('vocab', {}).get('definition', '')}"
        ).strip()

        return jsonify(
            {
                "metrics": metrics,
                "report": report,
                "analysis": analysis_text,
            }
        )

    except Exception as e:
        logger.error(f"Error in /analyze-sound: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/dialog", methods=["POST"])
@limiter.limit("15 per minute")
def dialog():
    try:
        if "audio" not in request.files:
            return jsonify({"error": "Missing audio file (field name must be 'audio')"}), 400

        audio_file = request.files["audio"]

        ctx_raw = request.form.get("context", "{}")
        ctx = {}
        try:
            ctx = json.loads(ctx_raw) if ctx_raw else {}
        except json.JSONDecodeError:
            ctx = {}

        difficulty = clamp_int(ctx.get("difficulty", 1), 1, 5, 1)
        total_points = clamp_int(ctx.get("points", 0), 0, 100000, 0)
        target_word = truncate(ctx.get("targetWord", ""), 64)
        analysis_text = truncate(ctx.get("analysisText", ""), 2000)
        current_question = truncate(ctx.get("currentQuestion", ""), 500)

        if not current_question:
            current_question = get_next_question(difficulty)

        fft = ctx.get("fft")
        fft_preview = fft[:40] if isinstance(fft, list) else None

        history = ctx.get("history", [])
        if not isinstance(history, list):
            history = []

        try:
            transcript_obj = client.audio.transcriptions.create(
                model="whisper-1",
                file=(audio_file.filename, audio_file.stream, audio_file.mimetype),
            )
            transcript = (transcript_obj.text or "").strip()
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return jsonify({"error": "Transcription failed"}), 500

        if is_idk(transcript):
            teach_prompt = f"""
You are a physics and signal-processing tutor.
The student said they do not know the answer.

Current difficulty: {difficulty}
Question: "{current_question}"

Give a short teaching response in STRICT JSON:
{{
  "reply": string,
  "score": number,
  "newDifficulty": integer,
  "nextQuestion": string
}}

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
- newDifficulty to max(1, {difficulty} - 1)
""".strip()

            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You output STRICT JSON only. No markdown."},
                    {"role": "user", "content": teach_prompt},
                ],
                temperature=0.25,
                max_tokens=420,
            )

            raw = (completion.choices[0].message.content or "").strip()
            ok, payload = safe_parse_json(raw)
            if not ok:
                payload = {
                    "reply": (
                        "Step 1: The question is asking about a sound feature in simple terms.\n"
                        "Step 2: The key idea is that pitch, loudness, and spectrum are related but not identical.\n"
                        "Step 3: For example, speaking louder usually raises amplitude, but not necessarily pitch.\n"
                        "Step 4: Rule of thumb: pitch relates to frequency, loudness relates to amplitude.\n"
                        "Step 5: What usually changes first when you speak louder: amplitude or pitch?"
                    ),
                    "score": 0.1,
                    "newDifficulty": max(1, difficulty - 1),
                    "nextQuestion": get_next_question(max(1, difficulty - 1)),
                }

            score = clamp_float(payload.get("score", 0.1), 0.0, 1.0, 0.1)
            new_difficulty = clamp_int(
                payload.get("newDifficulty", max(1, difficulty - 1)),
                1, 5, max(1, difficulty - 1)
            )
            reply = truncate(payload.get("reply", ""), 2000)
            next_question = truncate(payload.get("nextQuestion", get_next_question(new_difficulty)), 500)

            response_data = {
                "transcript": transcript,
                "reply": reply,
                "score": score,
                "pointsEarned": 0,
                "pointsReason": "Student said IDK -> teaching mode (0 pts)",
                "totalPoints": total_points,
                "difficulty": new_difficulty,
                "nextQuestion": next_question,
            }

            if ENABLE_TTS and reply:
                try:
                    speech_response = client.audio.speech.create(
                        model="tts-1",
                        voice="nova",
                        input=f"{reply}\nNext question: {next_question}",
                    )
                    audio_bytes = speech_response.read()
                    response_data["ttsAudioBase64"] = base64.b64encode(audio_bytes).decode("utf-8")
                    response_data["ttsMime"] = "audio/mpeg"
                except Exception as e:
                    logger.error(f"TTS generation failed in IDK path: {e}")

            return jsonify(response_data)

        ctx_summary = {
            "difficulty": difficulty,
            "totalPoints": total_points,
            "targetWord": target_word or None,
            "analysisText": analysis_text or None,
            "fftPreview": fft_preview,
            "questionAsked": current_question or None,
        }

        messages: List[Dict[str, str]] = [{"role": "system", "content": QUIZ_SYSTEM_PROMPT}]

        for turn in history[-8:]:
            if isinstance(turn, dict) and "role" in turn and "content" in turn:
                role = "user" if turn["role"] == "user" else "assistant"
                messages.append({"role": role, "content": truncate(turn["content"], 1500)})

        messages.append(
            {
                "role": "user",
                "content": f"""Context: {json.dumps(ctx_summary, indent=2)}

Question asked: "{current_question}"

Student's spoken answer: "{transcript}"

Evaluate the answer and respond with STRICT JSON.
""",
            }
        )

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.3,
            max_tokens=380,
        )

        raw = (completion.choices[0].message.content or "").strip()
        ok, payload = safe_parse_json(raw)

        if not ok:
            payload = {
                "reply": (
                    "Correct: You attempted an answer related to the question.\n"
                    "Missing: Add one more precise physics or signal-processing detail.\n"
                    "Next step: Use one specific term such as amplitude, resonance, or harmonics."
                ),
                "score": 0.5,
                "newDifficulty": difficulty,
                "nextQuestion": get_next_question(difficulty),
            }

        score = clamp_float(payload.get("score", 0.5), 0.0, 1.0, 0.5)
        new_difficulty = clamp_int(payload.get("newDifficulty", difficulty), 1, 5, difficulty)
        reply = truncate(payload.get("reply", "Correct: —\nMissing: —\nNext step: —"), 2000)
        next_question = truncate(payload.get("nextQuestion", get_next_question(new_difficulty)), 500)

        points_earned = compute_points(score, difficulty)
        total_points += points_earned
        points_reason = f"diff={difficulty} score={score:.2f} -> +{points_earned}"

        response_data: Dict[str, Any] = {
            "transcript": transcript,
            "reply": reply,
            "score": score,
            "pointsEarned": points_earned,
            "pointsReason": points_reason,
            "totalPoints": total_points,
            "difficulty": new_difficulty,
            "nextQuestion": next_question,
        }

        if ENABLE_TTS and reply:
            try:
                speech_response = client.audio.speech.create(
                    model="tts-1",
                    voice="nova",
                    input=f"{reply}\nNext question: {next_question}",
                )
                audio_bytes = speech_response.read()
                response_data["ttsAudioBase64"] = base64.b64encode(audio_bytes).decode("utf-8")
                response_data["ttsMime"] = "audio/mpeg"
            except Exception as e:
                logger.error(f"TTS generation failed: {e}")

        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Error in /dialog: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/get-question", methods=["POST"])
@limiter.limit("30 per minute")
def get_question():
    try:
        data = safe_json()
        difficulty = clamp_int(data.get("difficulty", 1), 1, 5, 1)
        return jsonify({"question": get_next_question(difficulty), "difficulty": difficulty})
    except Exception as e:
        logger.error(f"Error in /get-question: {e}")
        return jsonify({"error": "Internal server error"}), 500


# =========================================================
# Entry Point
# =========================================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    logger.info(f"Starting STEM Voice Recognition Lab on port {port} (debug={debug})")
    app.run(host="0.0.0.0", port=port, debug=debug)