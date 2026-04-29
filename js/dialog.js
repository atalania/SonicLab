import { dialog as callDialog } from './ai.js';
import { state } from './state.js';
import { el } from './dom.js';
import { updateStats } from './ui.js';
import { saveToLocalStorage } from './storage.js';

// Hold-to-talk race control. Pointer-up can fire while startRecording is still
// awaiting getUserMedia / Web Speech start; without this, the recorder ran
// AFTER the user released the button, leaving a recording that nothing would
// ever stop.
let startInFlight = false;
let pendingStop = false;

// Web Speech API session (when available). When set, we use the browser's
// own recognizer instead of going through the /api/ai/openai/whisper proxy
// — this lets the quiz work in pure dev / standalone mode with no backend.
let activeRecognition = null;
let recognitionResolve = null;

function isSpeechApiAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export async function unlockAudioForiOS() {
  if (state.ttsUnlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!state.unlockCtx) state.unlockCtx = new AC();
      if (state.unlockCtx.state === 'suspended') await state.unlockCtx.resume();
      const buf = state.unlockCtx.createBuffer(1, 1, 22050);
      const src = state.unlockCtx.createBufferSource();
      src.buffer = buf;
      src.connect(state.unlockCtx.destination);
      src.start(0);
    }
    state.ttsUnlocked = true;
  } catch (err) {
    // Don't latch ttsUnlocked=true on failure: a later user gesture should be
    // able to retry. The fallback recording flow still works because Whisper
    // doesn't depend on the unlock context.
    console.warn('unlockAudioForiOS: failed (will retry on next gesture):', err);
  }
}

async function ensureRecordingStream() {
  if (state.recordingStream) return state.recordingStream;
  // Use raw audio (no echoCancellation/noiseSuppression/AGC) so the recorded
  // clip matches the analyser's spectrogram view that the student sees.
  state.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return state.recordingStream;
}

function pickBestMime() {
  if (!window.MediaRecorder) return '';
  for (const t of ['audio/mp4','audio/mp4;codecs=mp4a.40.2','audio/aac','audio/webm;codecs=opus','audio/webm']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* skip */ }
  }
  return '';
}

function resetTalkButton() {
  el.talkBtn.disabled = false;
  el.talkBtn.textContent = '🎙️ Hold to Talk';
  el.talkBtn.classList.remove('recording');
}

// ── Web Speech API path ─────────────────────────────────────────────────
//
// Chrome/Edge/Safari ship `SpeechRecognition` (or `webkitSpeechRecognition`)
// which transcribes locally + via the browser vendor's service. This means
// the quiz works without us standing up a Whisper proxy.

function startWebSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  try {
    recognition = new SR();
  } catch (err) {
    console.warn('Web Speech API constructor failed:', err);
    return false;
  }

  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';
  const result = new Promise(resolve => {
    recognitionResolve = resolve;
    recognition.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + ' ';
        }
      }
    };
    recognition.onerror = e => {
      // 'no-speech' / 'aborted' / 'audio-capture' are non-fatal; resolve with
      // whatever we have. Anything else also resolves so the UI never hangs.
      console.warn('Speech recognition error:', e.error || e);
      if (recognitionResolve) {
        const r = recognitionResolve;
        recognitionResolve = null;
        r(finalTranscript.trim());
      }
    };
    recognition.onend = () => {
      if (recognitionResolve) {
        const r = recognitionResolve;
        recognitionResolve = null;
        r(finalTranscript.trim());
      }
    };
  });

  try {
    recognition.start();
    activeRecognition = { recognition, result };
    return true;
  } catch (err) {
    console.warn('Web Speech API start() failed:', err);
    activeRecognition = null;
    recognitionResolve = null;
    return false;
  }
}

async function stopWebSpeech() {
  if (!activeRecognition) return '';
  const { recognition, result } = activeRecognition;
  activeRecognition = null;
  try { recognition.stop(); } catch { /* ignore */ }
  return await result;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function startRecording() {
  if (!state.currentTarget) {
    el.aiReply.textContent = 'Enter Challenge Mode first to use the AI quiz.';
    return;
  }
  if (state.mediaRecorder?.state === 'recording') return;
  if (activeRecognition) return;
  if (startInFlight) return;

  startInFlight = true;
  pendingStop = false;
  el.talkBtn.disabled = true;
  el.talkBtn.textContent = '🎙️ Recording…';
  el.talkBtn.classList.add('recording');
  state.audioChunks = [];

  // Prefer the in-browser recognizer: it works with no backend running and
  // avoids uploading audio to a proxy. Fall back to MediaRecorder + Whisper
  // proxy only when the browser doesn't support Speech Recognition (Firefox).
  if (isSpeechApiAvailable() && startWebSpeech()) {
    startInFlight = false;
    el.talkBtn.disabled = false;
    if (pendingStop) {
      pendingStop = false;
      await stopRecordingAndSend();
    }
    return;
  }

  try {
    const stream = await ensureRecordingStream();
    const mime = pickBestMime();
    state.mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = e => {
      if (e.data?.size > 0) state.audioChunks.push(e.data);
    };
    state.mediaRecorder.onerror = () => {
      resetTalkButton();
    };
    state.mediaRecorder.start(250);
  } catch (err) {
    console.error('startRecording failed:', err);
    el.aiReply.textContent = '❌ Couldn\'t start recording. Check mic permissions.';
    resetTalkButton();
    startInFlight = false;
    pendingStop = false;
    return;
  }

  startInFlight = false;
  el.talkBtn.disabled = false;
  if (pendingStop) {
    pendingStop = false;
    await stopRecordingAndSend();
  }
}

export async function stopRecordingAndSend() {
  if (startInFlight) {
    pendingStop = true;
    return;
  }

  // ── Web Speech API path ──
  if (activeRecognition) {
    el.talkBtn.disabled = true;
    el.talkBtn.textContent = '⏳ Thinking…';
    el.talkBtn.classList.remove('recording');

    const transcript = await stopWebSpeech();
    if (!transcript) {
      resetTalkButton();
      el.aiReply.textContent = 'I didn\'t catch that — try speaking a bit louder.';
      return;
    }
    await runDialogTurn(null, transcript);
    return;
  }

  // ── MediaRecorder + Whisper proxy fallback path ──
  if (!state.mediaRecorder || state.mediaRecorder.state !== 'recording') {
    resetTalkButton();
    return;
  }

  el.talkBtn.disabled = true;
  el.talkBtn.textContent = '⏳ Thinking…';
  el.talkBtn.classList.remove('recording');

  let resolveStopped;
  const stopped = new Promise(resolve => { resolveStopped = resolve; });
  state.mediaRecorder.onstop = () => resolveStopped();
  try {
    state.mediaRecorder.stop();
  } catch (err) {
    console.warn('mediaRecorder.stop() threw:', err);
    resolveStopped();
    resetTalkButton();
    return;
  }
  await stopped;

  const mime = state.mediaRecorder.mimeType || 'audio/webm';
  const blob = new Blob(state.audioChunks, { type: mime });

  if (blob.size < 800) {
    resetTalkButton();
    el.aiReply.textContent = 'I didn\'t catch that — try speaking a bit louder.';
    return;
  }

  await runDialogTurn(blob, '');
}

function buildDialogContext(extraTranscript) {
  const tf = state.currentTarget?.features;
  return {
    mode: 'challenge',
    targetWord: state.currentTarget?.word || null,
    fft: state.currentTarget?.freq ? Array.from(state.currentTarget.freq).slice(0, 128) : null,
    targetPitchHz: tf?.pitchHz || 0,
    spectralCentroid: tf?.spectralCentroid || 0,
    spectralBandwidth: tf?.spectralBandwidth || 0,
    spectralRolloff: tf?.spectralRolloff || 0,
    spectralFlatness: tf?.spectralFlatness || 0,
    analysisText: state.currentTarget?.analysis || '',
    difficulty: state.difficulty,
    points: state.points,
    history: state.dialogHistory,
    currentQuestion: el.nextQ.textContent,
    transcript: extraTranscript || '',
  };
}

async function runDialogTurn(blob, transcriptOverride) {
  const ctx = buildDialogContext(transcriptOverride);

  try {
    const data = await callDialog(blob, ctx);

    el.studentTranscript.textContent = data.transcript || '(no transcript)';
    el.aiReply.textContent = data.reply || '(no reply)';
    el.nextQ.textContent = data.nextQuestion || '—';

    state.difficulty = data.difficulty ?? state.difficulty;
    state.points     = data.totalPoints ?? state.points;
    el.diff.textContent = state.difficulty;
    el.pts.textContent  = state.points;

    if (data.transcript) state.dialogHistory.push({ role: 'user', content: data.transcript });
    if (data.reply) state.dialogHistory.push({ role: 'assistant', content: data.reply });

    updateStats();
    saveToLocalStorage();
  } catch (err) {
    console.error('Dialog error:', err);
    // Distinguish "couldn't transcribe" from "couldn't grade" so the user
    // knows whether the issue is the mic / browser support or the proxy.
    const msg = String(err?.message || err || '');
    if (/transcription/i.test(msg)) {
      el.aiReply.textContent = '⚠ Transcription failed. Your browser may not support speech recognition and the Whisper proxy is unreachable. Try Chrome/Edge, or run a backend on port 3000.';
    } else {
      el.aiReply.textContent = '⚠ Dialog failed. Check connection and try again.';
    }
  } finally {
    resetTalkButton();
  }
}
