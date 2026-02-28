# 🧬 Sonic Fingerprint Lab (VoiceRecogPrototypeGame)

An interactive, web-based STEM mini-game where students **visualize their voice as a scrolling spectrogram (“waterfall plot”)** and learn how sound patterns relate to **frequency, energy, and speech acoustics**. Players build a small dataset of spoken words, then enter a challenge mode to identify a **mystery pattern** and answer an **AI oral quiz**.

---

## ✨ Features

### Lab Mode (Build Your Dataset)
- Live **waterfall spectrogram** visualization using the **Web Audio API**
- Capture a word + snapshot its spectrogram + store FFT magnitude data
- AI-generated “Lab Report” explaining the captured spectrum (via Flask proxy)
- Gallery of captured words with **delete** + **details popup**
- Progress bar + basic stats UI

### Challenge Mode (Test Pattern Recognition)
- Mystery spectrogram picked from your dataset
- Multiple-choice word identification
- **Live voice match meter** (cosine similarity vs. target FFT)
- “AI Lab Report” hint appears after incorrect guesses

### AI Oral Quiz (Voice → Feedback + Follow-up Question)
- Hold-to-record voice answers (pointer events for mobile reliability)
- Backend transcription with **Whisper**
- Tutor-style evaluation with **difficulty progression** and **points**
- Optional **TTS** responses + a manual **Replay Audio** button (mobile-friendly)

### Persistence
- Saves your dataset + stats to **localStorage** so progress survives refreshes

---

## 🔬 STEM Concepts Explored
- **Frequency vs. time (spectrograms):** how energy changes across frequency bins over time  
- **Speech acoustics:** vowels (harmonic/formant energy) vs consonants (noise/fricatives)  
- **Signal processing:** FFT bins, amplitude/energy distribution, similarity matching  
- **AI in STEM:** using models to generate explanations, evaluate oral responses, and scaffold learning

---

## 🎮 How to Play

1. **Start Microphone**
   - Click **🎤 Start Microphone** and allow permissions.
   - You’ll see the live scrolling spectrogram.

2. **Capture Words**
   - Type a word (ex: `HELLO`), say it, then click **📸 Capture & Analyze**.
   - Repeat until you have **4 unique words** (minimum to enter Challenge Mode).

3. **Enter Challenge Mode**
   - Click **🎯 Enter Challenge Mode →**
   - Identify which word produced the mystery spectrogram.

4. **Try the Oral Quiz**
   - Hold **🎙️ Hold to Talk** and answer the AI’s question out loud.
   - The AI evaluates your explanation, awards points, and asks a follow-up question.

---

## 🛠️ Tech Stack

**Frontend**
- HTML5 / CSS3 / Vanilla JS
- Web Audio API (real-time FFT + spectrogram rendering)
- Canvas (DPR-safe rendering for retina/mobile)

**Backend**
- Python + Flask
- flask-cors (locked to allowed origins)
- flask-limiter (rate limiting)
- OpenAI API:
  - `gpt-4o-mini` for analysis + tutoring
  - `whisper-1` for transcription
  - `tts-1` (optional) for voice playback

**Deployment**
- Frontend: GitHub Pages  
- Backend: Render  
  - Base URL: `https://voicerecogprototypegame.onrender.com`

---

## 🔌 API Endpoints

### `POST /analyze-sound`
Analyzes FFT magnitude preview and returns a short educational “Lab Report”.

Request (JSON):
```json
{
  "word": "HELLO",
  "frequencies": [0, 12, 53, ...]
}
```

Response (JSON):
```json
{
  "analysis": "…",
  "metrics": {
    "dominant_bin": 12,
    "dominant_region": "Mid Frequency (Voice)",
    "avg_amplitude": 34.2,
    "max_amplitude": 188,
    "energy_distribution": { "low": 22.1, "mid": 61.3, "high": 16.6 }
  }
}
```

### `POST /dialog`
Uploads recorded audio, transcribes it, evaluates the student’s spoken answer, updates difficulty/points, and optionally returns TTS audio.

Multipart form fields:
- `audio`: recorded blob
- `context`: JSON string with difficulty, points, target word, fft preview, etc.

### `GET /`
Health check endpoint.

---

## 🔒 Security Notes

This project uses a **Flask proxy** so the OpenAI API key is **never exposed in the browser**.

Backend protections include:
- API key stored in server environment variables (`OPENAI_API_KEY`)
- CORS restricted via `FRONTEND_ORIGINS`
- Rate limiting via `flask-limiter`
- Request size limit (3MB) for audio uploads

---

## 🚀 Local Development

### 1) Run the backend (Flask)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export OPENAI_API_KEY="your_key"
export FRONTEND_ORIGINS="http://localhost:5500,http://127.0.0.1:5500"
export ENABLE_TTS="1"  # optional

python app.py
```

Backend defaults to port `10000` (or `$PORT`).

### 2) Run the frontend
Use any static server (VSCode Live Server works fine).  
Make sure your frontend `API_URL` and `DIALOG_URL` point to your local Flask server if testing locally.

---

## 🧪 Tips / Known Constraints

- You must capture **4 unique words** before Challenge Mode unlocks.
- Mobile browsers can block autoplay audio; if TTS doesn’t play automatically, use **🔊 Play Audio**.
- Very short recordings are rejected to avoid empty transcriptions.

---

## 📜 License
Add your license here (MIT / Apache-2.0 / etc.).
