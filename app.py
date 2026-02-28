"""
STEM Voice Recognition Game - Enhanced Backend
================================================
Features:
- Structured educational feedback with difficulty progression
- Enhanced security (CORS, rate limiting, input validation)
- Comprehensive error handling and logging
- Educational content tailored to student level
- TTS support for AI responses
"""

import os
import json
import base64
import traceback
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded

from openai import OpenAI


# =========================================================
# Logging Configuration
# =========================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =========================================================
# Flask App Configuration
# =========================================================
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 3 * 1024 * 1024  # 3 MB for audio files

# CORS Configuration
FRONTEND_ORIGINS = os.environ.get("FRONTEND_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in FRONTEND_ORIGINS.split(",") if o.strip()]

if ALLOWED_ORIGINS:
    CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})
    logger.info(f"CORS enabled for origins: {ALLOWED_ORIGINS}")
else:
    CORS(app, resources={r"/*": {"origins": []}})
    logger.warning("No CORS origins configured - cross-origin requests blocked")

# Rate Limiting
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["500 per hour"],
    storage_uri="memory://"
)


@app.errorhandler(RateLimitExceeded)
def handle_ratelimit(e):
    logger.warning(f"Rate limit exceeded for {get_remote_address()}")
    return jsonify({"error": "Rate limit exceeded. Please try again soon."}), 429


@app.errorhandler(413)
def handle_large_file(e):
    return jsonify({"error": "File too large. Maximum 3MB allowed."}), 413


# =========================================================
# OpenAI Client Setup
# =========================================================
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    logger.error("OPENAI_API_KEY environment variable not set!")
    raise ValueError("OPENAI_API_KEY must be set in environment variables")

client = OpenAI(api_key=api_key)
ENABLE_TTS = os.environ.get("ENABLE_TTS", "0") == "1"

logger.info(f"OpenAI client initialized. TTS enabled: {ENABLE_TTS}")


# =========================================================
# Helper Functions
# =========================================================

def safe_json() -> Dict[str, Any]:
    """Safely extract JSON from request, returning empty dict on failure."""
    try:
        return request.get_json(silent=True) or {}
    except Exception as e:
        logger.error(f"Error parsing JSON: {e}")
        return {}


def clamp_int(x: Any, lo: int, hi: int, default: int) -> int:
    """Clamp integer value to range [lo, hi]."""
    try:
        v = int(x)
        return max(lo, min(hi, v))
    except (TypeError, ValueError):
        return default


def clamp_float(x: Any, lo: float, hi: float, default: float) -> float:
    """Clamp float value to range [lo, hi]."""
    try:
        v = float(x)
        return max(lo, min(hi, v))
    except (TypeError, ValueError):
        return default


def truncate(s: Any, n: int) -> str:
    """Truncate string to maximum length n."""
    return str(s)[:n] if s is not None else ""


def validate_frequencies(freq_values: Any) -> Tuple[bool, List[int]]:
    """
    Validate and sanitize frequency array.
    Returns: (is_valid, sanitized_array)
    """
    if not isinstance(freq_values, list):
        return False, []
    
    try:
        # Keep only numeric values, convert to int, limit to 80 values
        sanitized = [clamp_int(x, 0, 255, 0) for x in freq_values[:80]]
        return True, sanitized
    except Exception:
        return False, []


# =========================================================
# Educational Content Generators
# =========================================================

def analyze_frequency_spectrum(freq_values: List[int], word: str) -> Dict[str, Any]:
    """
    Perform detailed spectral analysis on frequency data.
    Returns structured analysis data.
    """
    if not freq_values:
        return {
            "dominant_bin": 0,
            "dominant_region": "unknown",
            "avg_amplitude": 0,
            "max_amplitude": 0,
            "energy_distribution": "unknown"
        }
    
    # Find dominant frequency
    max_amplitude = max(freq_values)
    dominant_bin = freq_values.index(max_amplitude)
    
    # Calculate average
    avg_amplitude = sum(freq_values) / len(freq_values)
    
    # Determine frequency region (low/mid/high)
    total_bins = len(freq_values)
    if dominant_bin < total_bins * 0.33:
        dominant_region = "Low Frequency (Bass)"
    elif dominant_bin < total_bins * 0.66:
        dominant_region = "Mid Frequency (Voice)"
    else:
        dominant_region = "High Frequency (Treble)"
    
    # Energy distribution
    low_energy = sum(freq_values[:int(total_bins*0.33)])
    mid_energy = sum(freq_values[int(total_bins*0.33):int(total_bins*0.66)])
    high_energy = sum(freq_values[int(total_bins*0.66):])
    
    total_energy = low_energy + mid_energy + high_energy
    if total_energy > 0:
        energy_distribution = {
            "low": round(low_energy / total_energy * 100, 1),
            "mid": round(mid_energy / total_energy * 100, 1),
            "high": round(high_energy / total_energy * 100, 1)
        }
    else:
        energy_distribution = {"low": 0, "mid": 0, "high": 0}
    
    return {
        "dominant_bin": dominant_bin,
        "dominant_region": dominant_region,
        "avg_amplitude": round(avg_amplitude, 2),
        "max_amplitude": max_amplitude,
        "energy_distribution": energy_distribution
    }


def generate_educational_prompt(word: str, freq_values: List[int], analysis: Dict[str, Any]) -> str:
    """Generate educational prompt for AI analysis."""
    return f"""
You are a Physics and Signal Processing tutor helping a student understand audio spectral analysis.

The student said the word: '{word}'

FFT Frequency Data (0-255 scale):
{freq_values[:40]}

Pre-computed Analysis:
- Dominant Frequency Bin: {analysis['dominant_bin']}
- Frequency Region: {analysis['dominant_region']}
- Average Amplitude: {analysis['avg_amplitude']}
- Max Amplitude: {analysis['max_amplitude']}
- Energy Distribution: Low={analysis['energy_distribution']['low']}%, Mid={analysis['energy_distribution']['mid']}%, High={analysis['energy_distribution']['high']}%

Write a direct educational analysis (2-3 sentences) about this audio pattern. DO NOT use phrases like "Great question!" or acknowledge any question - just provide the analysis.

Your response should:
1. Explain what the dominant frequency bin at position {analysis['dominant_bin']} tells us about the pitch
2. Describe what the energy distribution reveals about the word's acoustic characteristics
3. Note one interesting observation about this word's spectral signature

Write in a clear, informative style for high school students learning about sound waves and Fourier analysis.
"""



# =========================================================
# Quiz Question Generator
# =========================================================

DIFFICULTY_QUESTIONS = {
    1: [
        "What happens to the amplitude when you speak louder?",
        "Which frequency range (low, mid, or high) has the most energy in this pattern?",
        "If you spoke softer, would the amplitude increase or decrease?"
    ],
    2: [
        "Explain why vowels typically have energy in the mid-frequency range.",
        "What does it mean when a sound has energy concentrated in a narrow frequency range versus spread out?",
        "How would the spectrum differ if you spoke the same word at a higher pitch?"
    ],
    3: [
        "Describe the relationship between the fundamental frequency and harmonics in human speech.",
        "Why do different people saying the same word create different spectral patterns?",
        "What acoustic properties make this word's spectral signature unique?"
    ],
    4: [
        "Compare the spectral characteristics of voiced sounds (like vowels) versus unvoiced sounds (like 's' or 'f').",
        "How do formants contribute to the identification of different vowel sounds in speech?",
        "Explain why the FFT shows discrete frequency bins rather than a continuous spectrum."
    ],
    5: [
        "How would applying a low-pass filter affect the intelligibility of speech based on what you see in the spectrum?",
        "Design an experiment to test whether spectral features alone are sufficient for speaker identification.",
        "Explain the trade-off between time resolution and frequency resolution in the Short-Time Fourier Transform."
    ]
}


def get_next_question(difficulty: int) -> str:
    """Get an appropriate question for the current difficulty level."""
    import random
    questions = DIFFICULTY_QUESTIONS.get(difficulty, DIFFICULTY_QUESTIONS[1])
    return random.choice(questions)


# =========================================================
# Routes
# =========================================================

@app.route("/", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "online",
        "service": "STEM Voice Recognition Lab",
        "version": "2.0",
        "timestamp": datetime.utcnow().isoformat()
    }), 200


@app.route("/analyze-sound", methods=["POST"])
@limiter.limit("60 per minute")
def analyze_sound():
    """
    Analyze audio frequency spectrum and provide educational feedback.
    
    Request JSON:
    {
        "word": str,
        "frequencies": List[int]  // FFT magnitude values (0-255)
    }
    
    Response JSON:
    {
        "analysis": str,  // AI-generated educational analysis
        "metrics": {
            "dominant_bin": int,
            "dominant_region": str,
            "avg_amplitude": float,
            "max_amplitude": int,
            "energy_distribution": {...}
        }
    }
    """
    try:
        data = safe_json()
        word = truncate(data.get("word", "Unknown"), 64).upper()
        freq_values = data.get("frequencies", [])

        logger.info(f"Analyzing sound for word: {word}")

        # Validate input
        is_valid, freq_values = validate_frequencies(freq_values)
        if not is_valid:
            logger.warning("Invalid frequency data received")
            return jsonify({"error": "Invalid frequency data. Must be array of numbers."}), 400

        # Perform local analysis
        metrics = analyze_frequency_spectrum(freq_values, word)
        
        # Generate AI analysis
        prompt = generate_educational_prompt(word, freq_values, metrics)
        
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=200,
            messages=[
                {
                    "role": "system",
                    "content": "You are a physics tutor analyzing audio spectral data. Provide direct, factual analysis without conversational phrases like 'Great question!' or 'Thanks for asking.' Just give clear educational explanations."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        ai_response = completion.choices[0].message.content.strip()
        
        logger.info(f"Successfully analyzed word: {word}")
        
        return jsonify({
            "analysis": ai_response,
            "metrics": metrics
        })

    except Exception as e:
        logger.error(f"Error in /analyze-sound: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/dialog", methods=["POST"])
@limiter.limit("15 per minute")
def dialog():
    """
    Process audio dialog for oral quiz functionality.
    
    Multipart Form Data:
    - audio: audio file (webm/ogg)
    - context: JSON string with game context
    
    Response JSON:
    {
        "transcript": str,
        "reply": str,
        "score": float,  // 0.0 to 1.0
        "pointsEarned": int,
        "totalPoints": int,
        "difficulty": int,
        "nextQuestion": str,
        "ttsAudioBase64": str (optional),
        "ttsMime": str (optional)
    }
    """
    try:
        # Validate audio file
        if "audio" not in request.files:
            logger.warning("Dialog request missing audio file")
            return jsonify({"error": "Missing audio file (field name must be 'audio')"}), 400

        audio_file = request.files["audio"]
        
        # Parse context
        ctx_raw = request.form.get("context", "{}")
        try:
            ctx = json.loads(ctx_raw) if ctx_raw else {}
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in context field")
            ctx = {}

        logger.info("Processing dialog request")

        # Transcribe audio
        try:
            transcript_obj = client.audio.transcriptions.create(
                model="whisper-1",
                file=(audio_file.filename, audio_file.stream, audio_file.mimetype),
            )
            transcript = (transcript_obj.text or "").strip()
            logger.info(f"Transcription: {transcript[:100]}...")
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return jsonify({"error": "Transcription failed"}), 500

        # Extract context with safe defaults
        difficulty = clamp_int(ctx.get("difficulty", 1), 1, 5, 1)
        total_points = clamp_int(ctx.get("points", 0), 0, 100000, 0)
        target_word = truncate(ctx.get("targetWord", ""), 64)
        analysis_text = truncate(ctx.get("analysisText", ""), 2000)
        
        fft = ctx.get("fft")
        fft_preview = fft[:40] if isinstance(fft, list) else None
        
        history = ctx.get("history", [])
        if not isinstance(history, list):
            history = []

        # Build tutor system prompt
        system_prompt = """You are an interactive Physics and Signal Processing tutor conducting an oral quiz.

Your role:
1. Evaluate the student's spoken answer for correctness and depth of understanding
2. Provide encouraging, constructive feedback
3. Ask a follow-up question appropriate to their level

Respond with STRICT JSON using this schema:
{
  "reply": string,              // Your feedback (2-3 sentences, encouraging)
  "score": number,              // 0.0 to 1.0 based on answer quality
  "pointsEarned": integer,      // Points for this answer (0-10, scale with difficulty)
  "newDifficulty": integer,     // Adjusted difficulty 1-5
  "nextQuestion": string        // One clear follow-up question
}

Scoring rubric:
- 1.0: Perfect answer with clear explanation
- 0.7-0.9: Correct with minor gaps
- 0.4-0.6: Partially correct or incomplete
- 0.0-0.3: Incorrect or off-topic

Difficulty adjustment:
- Increase if score >= 0.75
- Decrease if score <= 0.35
- Otherwise maintain current level

Keep your reply warm and educational, not just evaluative."""

        # Build context summary
        ctx_summary = {
            "difficulty": difficulty,
            "totalPoints": total_points,
            "targetWord": target_word or None,
            "analysisText": analysis_text or None,
            "fftPreview": fft_preview
        }

        # Build message history
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        
        # Include recent conversation history
        for turn in history[-8:]:
            if isinstance(turn, dict) and "role" in turn and "content" in turn:
                role = "user" if turn["role"] == "user" else "assistant"
                messages.append({
                    "role": role,
                    "content": truncate(turn["content"], 1500)
                })

        # Add current question
        messages.append({
            "role": "user",
            "content": f"""Context: {json.dumps(ctx_summary, indent=2)}

Student's spoken answer: "{transcript}"

Difficulty levels:
1 - Basic observation (loud/quiet, frequency ranges)
2 - Pattern recognition (pitch regions, energy distribution)
3 - Concept application (harmonics, formants, acoustic properties)
4 - Comparative analysis (different sounds, spectral features)
5 - Advanced synthesis (filters, experiments, technical trade-offs)

Evaluate the answer and respond with JSON."""
        })

        # Get AI response
        logger.info(f"Requesting AI evaluation for difficulty level {difficulty}")
        
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.4,
            max_tokens=300
        )

        raw_response = (completion.choices[0].message.content or "").strip()

        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            if raw_response.startswith("```"):
                raw_response = raw_response.split("```")[1]
                if raw_response.startswith("json"):
                    raw_response = raw_response[4:]
            
            payload = json.loads(raw_response)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse AI JSON response: {e}")
            # Fallback response
            payload = {
                "reply": raw_response[:200] if raw_response else "Good effort! Let's explore this further.",
                "score": 0.5,
                "pointsEarned": 3,
                "newDifficulty": difficulty,
                "nextQuestion": get_next_question(difficulty)
            }

        # Extract and validate response data
        score = clamp_float(payload.get("score", 0.5), 0.0, 1.0, 0.5)
        points_earned = clamp_int(payload.get("pointsEarned", 0), 0, 10, 0)
        new_difficulty = clamp_int(payload.get("newDifficulty", difficulty), 1, 5, difficulty)
        reply = truncate(payload.get("reply", "Great attempt!"), 2000)
        next_question = truncate(
            payload.get("nextQuestion", get_next_question(new_difficulty)), 
            500
        )

        total_points += points_earned

        logger.info(f"Dialog processed: score={score}, points_earned={points_earned}, new_difficulty={new_difficulty}")

        # Build response
        response_data: Dict[str, Any] = {
            "transcript": transcript,
            "reply": reply,
            "score": score,
            "pointsEarned": points_earned,
            "totalPoints": total_points,
            "difficulty": new_difficulty,
            "nextQuestion": next_question
        }

        # Generate TTS if enabled
        if ENABLE_TTS and reply:
            try:
                logger.info("Generating TTS audio")
                speech_response = client.audio.speech.create(
                    model="tts-1",
                    voice="nova",
                    input=f"{reply} {next_question}"
                )
                
                audio_bytes = speech_response.read()
                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                
                response_data["ttsAudioBase64"] = audio_b64
                response_data["ttsMime"] = "audio/mpeg"
                logger.info("TTS audio generated successfully")
            except Exception as e:
                logger.error(f"TTS generation failed: {e}")
                # Continue without TTS

        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Error in /dialog: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500


# =========================================================
# Bonus: Get Quiz Question Endpoint
# =========================================================

@app.route("/get-question", methods=["POST"])
@limiter.limit("30 per minute")
def get_question():
    """
    Get an appropriate quiz question for the given difficulty level.
    
    Request JSON:
    {
        "difficulty": int  // 1-5
    }
    
    Response JSON:
    {
        "question": str,
        "difficulty": int
    }
    """
    try:
        data = safe_json()
        difficulty = clamp_int(data.get("difficulty", 1), 1, 5, 1)
        
        question = get_next_question(difficulty)
        
        return jsonify({
            "question": question,
            "difficulty": difficulty
        })
    
    except Exception as e:
        logger.error(f"Error in /get-question: {e}")
        return jsonify({"error": "Internal server error"}), 500


# =========================================================
# Application Entry Point
# =========================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    
    logger.info(f"Starting STEM Voice Recognition Lab on port {port}")
    logger.info(f"Debug mode: {debug}")
    
    app.run(host="0.0.0.0", port=port, debug=debug)