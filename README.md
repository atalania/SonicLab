# 🧬 Sonic Fingerprint Lab

An interactive, web-based STEM mini-game where students **visualize their voice as a scrolling spectrogram (“waterfall plot”)** and learn how sound patterns relate to **frequency, energy, and speech acoustics**. Players build a small dataset of spoken words, then enter a challenge mode to identify a **mystery pattern** and answer an **AI oral quiz**.

The current codebase is **v3.0** (modular vanilla JS): richer **live acoustic readouts**, **optional auto-capture**, a deep **pattern detail** view, and AI features that call a **host-provided HTTP proxy** (no API keys in the browser). When embedded in the LLNL STEM Games portal, it also emits **analytics events** via `postMessage`.

---

## ✨ Features

### Lab Mode (Build Your Dataset)
- Live **waterfall spectrogram** (Web Audio API, FFT **2048**, smoothing), **frequency axis** labels, and **DPR-aware** canvas
- **Live readouts** while the mic is active: estimated **pitch (F0)**, **spectral centroid**, **energy (RMS dB)**, **spectral flatness**, **bandwidth**, **spectral rolloff**
- **Manual capture:** type a word, then **📸 Capture** — snapshot, averaged spectrum, and full **DSP feature** set
- **Auto Capture (🤖 Auto):** voice-activity detection freezes a snapshot and opens a **label modal** so you name the word after speaking
- **AI Lab Report** via `gpt-4o-mini`: structured JSON (**summary**, **what_it_means**, **try_this**, **vocab**) with conservative wording (pitch vs. FFT energy, clarity thresholds); merged into readable on-screen text
- Payload includes **sample rate**, **FFT size**, **pitch estimate + clarity**, **centroid / bandwidth / rolloff / flatness**, **per-band energies**, **dominant peaks**, and **formant estimates** for richer tutoring
- **Offline fallback** if the AI proxy is unreachable: local **educational note** from computed features
- **Gallery** of captured words: delete, click for **analysis modal** (snapshot, spectrum chart, feature grid, band distribution, dominant frequencies, note + AI text)
- **Dataset progress** (0/4), **stats ribbon** (words, challenge **score**, oral-quiz **level**), **🔄 Reset** (clears saved data after confirm)

### Challenge Mode (Test Pattern Recognition)
- Mystery spectrogram from your library; **multiple-choice** word pick
- **Live Voice Match** meter (cosine similarity vs. target spectrum)
- **AI Lab Report** hint after incorrect guesses (tracks **hint** events for the portal)

### AI Oral Quiz (Voice → Feedback + Follow-up Question)
- **Hold-to-talk** using **pointer events** (mobile-friendly)
- Transcription through **`whisper-1`** on the host proxy
- Tutor evaluation: **difficulty 1–5**, **rubric-based points**, **follow-up questions**, and **conversation history** (recent turns sent with each request; a slice persisted in **localStorage**)
- Special path when the student says they **don’t know**: stepped teaching JSON (**Step 1…5**), lower score, easier difficulty
- Feedback is **text-first** on-screen; **🔊 Play Audio** / iOS **audio unlock** helpers remain in the UI for hosts that attach spoken playback later

### Persistence
- **localStorage** (`sonic-fingerprint-lab-data`, schema **v2**): library entries (image, FFT bytes, **float magnitudes**, **features**, analysis text), challenge score, quiz **difficulty**, **points**, and **dialog history**

### Portal / embed (optional)
- When running **inside an iframe**, sends `postMessage` payloads (`type: 'ASSISTANT_GAME_EVENT'`) for **level start/complete**, **captures**, **correct/incorrect** challenge answers, **hints**, and **idle nudge** (2-minute idle timer)
- `postMessage` target origin is locked to `VITE_PORTAL_ORIGIN` when set; otherwise it falls back to the iframe referrer origin (or same-origin as a final fallback)
- Standalone dev: events are logged to the console only
- **Leaderboards & cloud JSON** (slug `sonic-lab`, `PORTAL_GAME_DATA_*` bridge, score paths the hub reads): see [LEADERBOARD_PORTAL.md](LEADERBOARD_PORTAL.md)

On `/games/sonic-lab`, the portal sets the iframe **CSS height** from `embedHeight` in `data/game.json` (resolved with `resolveEmbedHeights` in the portal’s `src/lib/games/embed-height.ts`). The game is **not** full viewport: `100vh` / `100dvh` in your CSS refer to the **browser tab**, not the iframe slot, so this repo uses **`html, body { height: 100%; overflow: hidden }`** and scrolls inside **`#app`**, with spectrum canvases sized from their **containers** (`getBoundingClientRect` in `fitCanvas`). See **Portal / mobile iframe checklist** below.

---

## 🔬 STEM Concepts Explored
- **Time–frequency views:** scrolling spectrogram; energy vs. frequency bin over time  
- **Timbral / spectral measures:** centroid, spread, flatness, rolloff, bandwidth; **tonal vs. noise-like** intuition  
- **Speech acoustics:** vowel energy / **formant-related** structure vs. noisy consonants  
- **Pitch vs. spectrum:** fundamental-frequency estimate separate from where FFT energy peaks  
- **Signal processing:** FFT bins, band energy breakdown, similarity (**cosine**) matching  
- **AI in STEM:** model-generated lab reports, Whisper transcription, structured oral-quiz feedback with difficulty scaffolding  

---

## 🎮 How to Play

1. **Start microphone**  
   Click **🎤 Start Mic** and allow access. The live waterfall spectrum and readouts appear.

2. **Capture four unique words**  
   - **Manual:** type the word (e.g. `HELLO`), say it, click **📸 Capture**.  
   - **Auto:** turn **🤖 Auto** **ON**, speak clearly; when the app freezes a snapshot, **label** it in the modal and **💾 Save**.  
   Duplicates are rejected. Progress shows **n / 4**.

3. **Enter Challenge Mode**  
   Click **🎯 Enter Challenge Mode →**, pick the word that matches the **mystery** spectrum, and use the **Live Voice Match** meter.

4. **Oral quiz**  
   Hold **🎙️ Hold to Talk** to answer the question in **Next Question**. The AI scores you, adjusts level, adds points, and asks a follow-up. Use **Next Round →** for another mystery word.

5. **Gallery details**  
   Click any card to open the full **pattern analysis** view; use **×** on a card to remove a word from the dataset.

---

## 🛠️ Tech Stack

**Frontend**
- HTML5 / CSS3 / **ES modules** (vanilla JS)
- **Vite** 6 (dev server, production build)
- Web Audio API (**AnalyserNode**, byte + float spectra, time domain)
- Canvas (devicePixelRatio–aware sizing)
- Client-side **DSP** (centroid, bandwidth, rolloff, flatness, RMS, peaks, formant-style tracking, band energies — see `js/dsp.js`, `js/config.js` **FREQ_BANDS**)

**AI & transcription (via host proxy)**
- `gpt-4o-mini` for lab reports and quiz grading (strict JSON prompts in `js/ai.js`)
- `whisper-1` for speech-to-text  
- The repository **does not** ship a Flask app; logic previously in Python is **ported to the client** except for calls that must stay server-side (**OpenAI proxy** on the embedding host).

**Deployment metadata**
- `data/game.json` — `game-id`, title, copy, tags, **`embedHeight`** (fixed minimum for the portal iframe, e.g. `760px`), version (used for Vite `base`: `/staticGames/<game-id>/`)

---

## Portal / mobile iframe checklist

Use this when validating embeds on the LLNL STEM Games portal (`/games/sonic-lab`). Optional team doc: `MOBILE_EMBED_GAME_GUIDE.md` in the portal repository.

- [ ] Viewport meta: `width=device-width`, `initial-scale=1`, `viewport-fit=cover` (see `index.html`)
- [ ] Root layout: `html, body { height: 100%; width: 100%; }`, scroll inside `#app` — **no** `100vh` / `100dvh` as the sole height chain for the main game surface
- [ ] Resize: `resize` + `load` + `visualViewport` `resize` / `scroll` → `fitCanvas` / axis labels from **container** geometry (`js/app.js`, `js/dom.js`)
- [ ] Touch: controls ≥ 44×44px tap targets on narrow widths; `touch-action: manipulation` on `body` (`.btn-talk` keeps `touch-action: none` for hold-to-talk)
- [ ] Safe area: mobile rules use `env(safe-area-inset-*)` on `#app`, modals, and tutorial (`css/styles.css` `@media (max-width: 600px)` / `520px`)
- [ ] Test: `/games/sonic-lab` on a real phone (portrait + landscape) and **Open in new tab** from the toolbar
- [ ] `embedHeight` in `data/game.json` matches the minimum playable height you tested (currently `760px`)

**Quick verification**

1. Run the portal, open `/games/sonic-lab`.
2. DevTools → responsive mode → pick a phone height.
3. Confirm **one** primary scroll (inside `#app`, not fighting the portal page).
4. Confirm spectrum canvases use the visible iframe width without horizontal clip.
5. Tap **open in new tab** — layout still works at small widths.

---

## 🔌 Host API contract (embedding)

The game expects a same-origin (or CORS-allowed) backend that implements:

### `POST /api/ai/openai`
OpenAI **Chat Completions**–style proxy. Request body (JSON) includes at least:
- `model` (e.g. `gpt-4o-mini`)
- `messages`
- `max_tokens`, `temperature`

Response: standard OpenAI chat shape; the client reads `choices[0].message.content`.

### `POST /api/ai/openai/whisper`
**Multipart** form upload:
- `file` — audio blob (e.g. `audio.webm`)
- `model` — `whisper-1`

Response: JSON with a `text` field (transcript).

### Local development proxy
`vite.config.js` forwards **`/api`** to **`http://localhost:3000`**. Run your portal API (or a small mock) on that port, or change the proxy target.

**Health check:** there is no longer a dedicated `GET /` in this repo; use your host service’s health endpoint.

---

## 🔒 Security Notes

- **API keys** belong only on the **server** that implements `/api/ai/*`, never in this static frontend.
- Rate limits, CORS, and upload size limits are **the host’s responsibility** (this app sends short JSON and small audio clips; very short recordings under ~800 bytes are rejected client-side to avoid empty transcripts).
- Set `VITE_PORTAL_ORIGIN` in your environment when embedding this app so analytics `postMessage` events are sent only to your expected portal origin.

---

## 🚀 Local Development

### 1) Install and run Vite
```bash
npm install
npm run dev
```
Open the URL Vite prints (default `http://localhost:5173`). Ensure something on **port 3000** serves `/api/ai/openai` and `/api/ai/openai/whisper`, or adjust `vite.config.js` → `server.proxy`.

### 2) Production build
```bash
npm run build
npm run preview   # optional local preview of dist/
```
Built assets assume base path **`/staticGames/sonic-lab/`** (from `data/game.json`).

### 3) Legacy Flask backend (optional)
Older deployments used a separate Flask service (`POST /analyze-sound`, `POST /dialog`). The **current** game talks to **`/api/ai/*` only**; adapt or replace the old routes on your host if you still use them.

---

## 🧪 Tips / Known Constraints

- **Four unique words** are required before Challenge Mode unlocks.
- **Auto Capture** disables the manual word field and capture button while ON; turn it **OFF** to type words again.
- **Mobile** browsers may block autoplay; spoken playback depends on host integration — primary feedback is always visible text.
- Recordings shorter than **~800 bytes** are ignored with a “try again” style message.
- **localStorage** quota: large datasets may hit browser limits; delete captures or use **Reset** if saving fails.

