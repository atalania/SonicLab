"""
STEM Voice Recognition Game - Backend (Improved Tutor + Deterministic Points)
============================================================================
What’s improved vs your current version:
- /analyze-sound returns a structured “mini lab report” (JSON) + metrics
- /dialog uses the *current question* from the frontend context (less random)
- points are computed server-side (consistent, difficulty-scaled)
- safer JSON parsing + graceful fallbacks
- keeps your existing routes + Render/Gunicorn compatibility

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
from typing import Any, Dict, List, Tuple
from datetime import datetime

from flask import Flask, request, jsonify
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
    # block cross-origin by default
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
    # remove punctuation-ish
    t = re.sub(r"[^a-z0-9\s']", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    phrases = [
        "i don't know", "i dont know", "idk", "no idea", "not sure",
        "i'm not sure", "im not sure", "i forgot", "can't remember", "cant remember",
        "i dunno", "dont know"
    ]
    return any(p in t for p in phrases)
# =========================================================
# Spectral Metrics
# =========================================================
def analyze_frequency_spectrum(freq_values: List[int], word: str, sample_rate: float = 44100, fft_size: int = 1024) -> Dict[str, Any]:
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
    mid_energy = sum(freq_values[int(total_bins * 0.33) : int(total_bins * 0.66)])
    high_energy = sum(freq_values[int(total_bins * 0.66) :])

    total_energy = low_energy + mid_energy + high_energy
    if total_energy > 0:
        energy_distribution = {
            "low": round(low_energy / total_energy * 100, 1),
            "mid": round(mid_energy / total_energy * 100, 1),
            "high": round(high_energy / total_energy * 100, 1),
        }
    else:
        energy_distribution = {"low": 0, "mid": 0, "high": 0}

    # peakiness = max / mean (how “spiky” vs “flat/noisy”)
    peakiness = round(max_amplitude / (avg_amplitude + 1e-6), 2)

    # spectral centroid (brightness proxy)
    weighted_sum = sum(i * v for i, v in enumerate(freq_values))
    total = sum(freq_values) + 1e-6
    centroid = weighted_sum / total

    # spectral spread (bandwidth proxy)
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
    You are a physics + signal-processing tutor.
    Do not infer exact vocal pitch from FFT bin position alone.

    Word spoken: "{word}"

FFT magnitudes (0-255), first 40 bins:
{freq_values[:40]}

Computed metrics:
- Dominant bin: {m['dominant_bin']} (~{m['dominant_hz']} Hz, {m['dominant_region']})
- Avg amplitude: {m['avg_amplitude']}
- Max amplitude: {m['max_amplitude']}
- Peakiness (max/avg): {m['peakiness']}
- Spectral centroid (brightness): {m['spectral_centroid']}
- Spectral spread (bandwidth): {m['spectral_spread']}
- Energy distribution: low={m['energy_distribution']['low']}% mid={m['energy_distribution']['mid']}% high={m['energy_distribution']['high']}%

Return STRICT JSON:
{{
  "summary": "1 sentence in plain language",
  "what_it_means": "1–2 sentences linking metrics to spectral energy distribution, resonance, and tonal vs noisy characteristics. Do not claim exact pitch from FFT bin position alone.",
  "try_this": "1 short experiment the student can do (e.g., whisper, pitch up, louder)",
  "vocab": {{
    "term": "one key term like 'harmonics' or 'formants' or 'spectral centroid'",
    "definition": "1 sentence definition"
  }}
}}

No fluff. No praise. No 'Great question'. Just useful info.
""".strip()


# =========================================================
# Deterministic Points
# =========================================================
def compute_points(score: float, difficulty: int) -> int:
    """
    Deterministic, explainable scoring:
    - base grows with difficulty
    - multiplier grows with answer quality
    """
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
    import random

    DIFFICULTY_QUESTIONS = {
        1: [
            "What happens to the amplitude when you speak louder?",
            "Which frequency range (low, mid, or high) has the most energy in this pattern?",
            "If you spoke softer, would the amplitude increase or decrease?",
        ],
        2: [
            "Explain why vowels typically have energy in the mid-frequency range.",
            "What does it mean when energy is concentrated in a narrow range vs spread out?",
            "How would the spectrum change if you spoke the same word at a higher pitch?",
        ],
        3: [
            "Describe the relationship between the fundamental frequency and harmonics in speech.",
            "Why can two people saying the same word produce different spectral patterns?",
            "What acoustic properties might make this word’s signature unique?",
        ],
        4: [
            "Compare voiced sounds (vowels) vs unvoiced sounds ('s', 'f') in the spectrum.",
            "How do formants help distinguish vowel sounds?",
            "Why does the FFT show discrete bins instead of a continuous spectrum?",
        ],
        5: [
            "How would a low-pass filter affect speech intelligibility based on the spectrum?",
            "Design an experiment to test whether spectral features alone can identify speakers.",
            "Explain the time–frequency resolution trade-off in the Short-Time Fourier Transform.",
        ],
    }
    questions = DIFFICULTY_QUESTIONS.get(difficulty, DIFFICULTY_QUESTIONS[1])
    return random.choice(questions)


# =========================================================
# Routes
# =========================================================
@app.route("/", methods=["GET"])
def health_check():
    return jsonify(
        {
            "status": "online",
            "service": "STEM Voice Recognition Lab",
            "version": "3.0",
            "timestamp": datetime.utcnow().isoformat(),
        }
    ), 200


@app.route("/analyze-sound", methods=["POST"])
@limiter.limit("60 per minute")
def analyze_sound():
    """
    Request JSON:
    {
        "word": str,
        "frequencies": List[int]
    }

    Response:
    {
        "metrics": {...},
        "report": {...},   # structured mini lab report
        "analysis": str    # fallback human-readable string
    }
    """
    try:
        data = safe_json()
        word = truncate(data.get("word", "Unknown"), 64).upper()
        freq_values = data.get("frequencies", [])

        is_valid, freq_values = validate_frequencies(freq_values)
        if not is_valid:
            return jsonify({"error": "Invalid frequency data. Must be array of numbers."}), 400

        sample_rate = clamp_float(data.get("sampleRate", 44100), 8000, 96000, 44100)
        fft_size = clamp_int(data.get("fftSize", 1024), 256, 8192, 1024)

        metrics = analyze_frequency_spectrum(freq_values, word, sample_rate, fft_size)
        prompt = generate_lab_report_prompt(word, freq_values, metrics)

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.25,
            max_tokens=350,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a physics + signal-processing tutor. "
                        "You output STRICT JSON only, no markdown."
                        "Do not infer exact vocal pitch from FFT bin position alone."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )

        raw = (completion.choices[0].message.content or "").strip()
        ok, report = safe_parse_json(raw)

        if not ok:
            # fallback: simple readable text
            report = {
                "summary": f"Dominant energy is in {metrics['dominant_region']} with peak bin {metrics['dominant_bin']}.",
                "what_it_means": (
                    f"Energy split is low={metrics['energy_distribution']['low']}%, "
                    f"mid={metrics['energy_distribution']['mid']}%, high={metrics['energy_distribution']['high']}%. "
                    f"Peakiness {metrics['peakiness']} suggests {'more tonal (harmonic)' if metrics['peakiness'] > 2.0 else 'more noise-like'} content."
                ),
                "try_this": "Try whispering the same word and compare how the spectrum becomes more high-frequency/noise-heavy.",
                "vocab": {"term": "spectral centroid", "definition": "A number that estimates how ‘bright’ a sound is by weighting higher frequencies more."},
            }

        analysis_text = (
            f"{report.get('summary','')}\n"
            f"{report.get('what_it_means','')}\n"
            f"Try this: {report.get('try_this','')}\n"
            f"Vocab — {report.get('vocab',{}).get('term','')}: {report.get('vocab',{}).get('definition','')}"
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
    """
    Multipart form-data:
    - audio: file
    - context: JSON string

    Frontend context should include (recommended):
    - difficulty, points, targetWord, analysisText, fft (optional)
    - history (optional)
    - currentQuestion (IMPORTANT: send elements.nextQ.textContent)

    Response JSON:
    {
        "transcript": str,
        "reply": str,
        "score": float,
        "pointsEarned": int,
        "pointsReason": str,
        "totalPoints": int,
        "difficulty": int,
        "nextQuestion": str,
        "ttsAudioBase64": str (optional),
        "ttsMime": str (optional)
    }
    """
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

        # ✅ Extract context ONCE with safe defaults (always defined)
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

        # Transcribe
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
        You are a Physics + Signal Processing tutor. The student said they don't know.

        Current difficulty: {difficulty}
        Question: "{current_question}"

        Give a short walkthrough that teaches the correct answer:
        - Step 1: Restate the question in simpler words.
        - Step 2: Explain the key concept needed.
        - Step 3: Apply it to a concrete example related to speaking (louder/softer, higher pitch, whisper).
        - Step 4: Give a one-sentence 'rule of thumb'.
        - Step 5: Ask ONE quick check-for-understanding question.

        Keep it clear and high-school friendly. No fluff.
        Return STRICT JSON:
        {{
        "reply": string,
        "score": number,
        "newDifficulty": integer,
        "nextQuestion": string
        }}
        Set score to 0.0–0.2 since they didn’t answer.
        Set newDifficulty to max(1, {difficulty} - 1)
        """
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You output STRICT JSON only. No markdown."},
                    {"role": "user", "content": teach_prompt},
                ],
                temperature=0.3,
                max_tokens=420,
            )

            raw = (completion.choices[0].message.content or "").strip()
            ok, payload = safe_parse_json(raw)
            if not ok:
                payload = {
                    "reply": "Step 1: ...", "score": 0.1,
                    "newDifficulty": max(1, difficulty-1),
                    "nextQuestion": get_next_question(max(1, difficulty-1)),
                }

            score = clamp_float(payload.get("score", 0.1), 0.0, 1.0, 0.1)
            new_difficulty = clamp_int(payload.get("newDifficulty", max(1, difficulty-1)), 1, 5, max(1, difficulty-1))
            reply = truncate(payload.get("reply", ""), 2000)
            next_question = truncate(payload.get("nextQuestion", get_next_question(new_difficulty)), 500)

            points_earned = 0  # since they said IDK
            total_points += points_earned

            response_data = {
                "transcript": transcript,
                "reply": reply,
                "score": score,
                "pointsEarned": points_earned,
                "pointsReason": "Student said IDK -> teaching mode (0 pts)",
                "totalPoints": total_points,
                "difficulty": new_difficulty,
                "nextQuestion": next_question,
            }
            # (TTS same as usual)
            return jsonify(response_data)

 

        fft = ctx.get("fft")
        fft_preview = fft[:40] if isinstance(fft, list) else None

        history = ctx.get("history", [])
        if not isinstance(history, list):
            history = []

        # Tutor prompt: structured feedback
        system_prompt = """
You are an interactive Physics and Signal Processing tutor conducting an oral quiz.

You MUST return STRICT JSON (no markdown) in this schema:
{
  "reply": string,          // 3 bullets labeled: Correct / Missing / Next step
  "score": number,          // 0.0 to 1.0
  "newDifficulty": integer, // 1-5
  "nextQuestion": string    // One clear follow-up question
}

Scoring rubric:
- 1.0: Correct + clear explanation + uses correct terms
- 0.7-0.9: Correct with minor gaps
- 0.4-0.6: Partially correct or vague
- 0.0-0.3: Incorrect or off-topic

Difficulty adjustment:
- Increase if score >= 0.75
- Decrease if score <= 0.35
- Else keep the same

Style rules:
- Reply MUST be 3 bullet points exactly:
  - "Correct: ..."
  - "Missing: ..."
  - "Next step: ..."
- Be concise, specific, and educational.
""".strip()

        ctx_summary = {
            "difficulty": difficulty,
            "totalPoints": total_points,
            "targetWord": target_word or None,
            "analysisText": analysis_text or None,
            "fftPreview": fft_preview,
            "questionAsked": current_question or None,
        }

        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

        # include recent history
        for turn in history[-8:]:
            if isinstance(turn, dict) and "role" in turn and "content" in turn:
                role = "user" if turn["role"] == "user" else "assistant"
                messages.append({"role": role, "content": truncate(turn["content"], 1500)})

        messages.append(
            {
                "role": "user",
                "content": f"""Context: {json.dumps(ctx_summary, indent=2)}

Question asked (if present): "{current_question}"

Student's spoken answer: "{transcript}"

Evaluate the answer and respond with STRICT JSON.
""",
            }
        )

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.35,
            max_tokens=380,
        )

        raw = (completion.choices[0].message.content or "").strip()
        ok, payload = safe_parse_json(raw)

        # Fallback if model returns non-JSON
        if not ok:
            payload = {
                "reply": f"Correct: You responded to the question.\nMissing: Add one specific physics detail (amplitude, frequency range, harmonics).\nNext step: Try answering with one metric and what it implies.",
                "score": 0.5,
                "newDifficulty": difficulty,
                "nextQuestion": get_next_question(difficulty),
            }

        score = clamp_float(payload.get("score", 0.5), 0.0, 1.0, 0.5)
        new_difficulty = clamp_int(payload.get("newDifficulty", difficulty), 1, 5, difficulty)
        reply = truncate(payload.get("reply", "Correct: —\nMissing: —\nNext step: —"), 2000)
        next_question = truncate(payload.get("nextQuestion", get_next_question(new_difficulty)), 500)

        # Deterministic points
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

        # TTS (optional)
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