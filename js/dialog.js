import { DIALOG_URL } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';
import { updateStats } from './ui.js';
import { saveToLocalStorage } from './storage.js';

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
  } catch {
    state.ttsUnlocked = true;
  }
}

async function ensureRecordingStream() {
  if (state.recordingStream) return state.recordingStream;
  state.recordingStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  return state.recordingStream;
}

function pickBestMime() {
  if (!window.MediaRecorder) return '';
  for (const t of ['audio/mp4','audio/mp4;codecs=mp4a.40.2','audio/aac','audio/webm;codecs=opus','audio/webm']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* skip */ }
  }
  return '';
}

export async function startRecording() {
  if (!state.currentTarget) {
    el.aiReply.textContent = 'Enter Challenge Mode first to use the AI quiz.';
    return;
  }
  if (state.mediaRecorder?.state === 'recording') return;

  el.talkBtn.disabled = true;
  el.talkBtn.textContent = '🎙️ Recording…';
  el.talkBtn.classList.add('recording');
  state.audioChunks = [];

  try {
    const stream = await ensureRecordingStream();
    const mime = pickBestMime();
    state.mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = e => {
      if (e.data?.size > 0) state.audioChunks.push(e.data);
    };
    state.mediaRecorder.onerror = () => {
      el.talkBtn.disabled = false;
      el.talkBtn.textContent = '🎙️ Hold to Talk';
      el.talkBtn.classList.remove('recording');
    };
    state.mediaRecorder.start(250);
  } catch (err) {
    console.error('startRecording failed:', err);
    el.aiReply.textContent = '❌ Couldn\'t start recording. Check mic permissions.';
  } finally {
    setTimeout(() => { el.talkBtn.disabled = false; }, 120);
  }
}

export async function stopRecordingAndSend() {
  if (!state.mediaRecorder || state.mediaRecorder.state !== 'recording') {
    el.talkBtn.disabled = false;
    el.talkBtn.textContent = '🎙️ Hold to Talk';
    el.talkBtn.classList.remove('recording');
    return;
  }

  el.talkBtn.disabled = true;
  el.talkBtn.textContent = '⏳ Thinking…';
  el.talkBtn.classList.remove('recording');

  const stopped = new Promise(resolve => { state.mediaRecorder.onstop = resolve; });
  try { state.mediaRecorder.stop(); } catch {
    el.talkBtn.disabled = false;
    el.talkBtn.textContent = '🎙️ Hold to Talk';
    return;
  }
  await stopped;

  const mime = state.mediaRecorder.mimeType || 'audio/webm';
  const blob = new Blob(state.audioChunks, { type: mime });

  if (blob.size < 800) {
    el.talkBtn.disabled = false;
    el.talkBtn.textContent = '🎙️ Hold to Talk';
    el.aiReply.textContent = 'I didn\'t catch that — try speaking a bit louder.';
    return;
  }

  const tf = state.currentTarget?.features;
  const ctx = {
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
    currentQuestion: el.nextQ.textContent
  };

  const form = new FormData();
  form.append('audio', blob, 'answer');
  form.append('context', JSON.stringify(ctx));

  try {
    const resp = await fetch(DIALOG_URL, { method: 'POST', body: form });
    if (!resp.ok) throw new Error('Dialog request failed');
    const data = await resp.json();

    el.studentTranscript.textContent = data.transcript || '(no transcript)';
    el.aiReply.textContent = data.reply || '(no reply)';
    el.nextQ.textContent = data.nextQuestion || '—';

    state.difficulty = data.difficulty ?? state.difficulty;
    state.points     = data.totalPoints ?? state.points;
    el.diff.textContent = state.difficulty;
    el.pts.textContent  = state.points;

    if (data.transcript) state.dialogHistory.push({ role: 'user', content: data.transcript });
    if (data.reply) state.dialogHistory.push({ role: 'assistant', content: data.reply });

    if (data.ttsAudioBase64 && data.ttsMime) {
      await playTtsResponse(data.ttsAudioBase64, data.ttsMime);
    }

    updateStats();
    saveToLocalStorage();
  } catch (err) {
    console.error('Dialog error:', err);
    el.aiReply.textContent = '⚠ Dialog failed. Check connection and try again.';
  } finally {
    el.talkBtn.disabled = false;
    el.talkBtn.textContent = '🎙️ Hold to Talk';
  }
}

async function playTtsResponse(base64, mime) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const audioBlob = new Blob([bytes], { type: mime });
  state.lastTtsData = { blob: audioBlob, mime };

  const replayBtn = document.getElementById('replayTtsBtn');
  if (replayBtn) {
    replayBtn.classList.remove('hidden');
    replayBtn.onclick = () => playStoredTts();
  }

  const url = URL.createObjectURL(audioBlob);
  const audio = new Audio(url);
  audio.playsInline = true;
  audio.volume = 1.0;
  audio.load();
  await new Promise(r => setTimeout(r, 50));

  try {
    await audio.play();
  } catch (e) {
    console.error('TTS autoplay blocked:', e.name);
    alert('🔊 Audio ready! Tap \'Play Audio\' to hear the response.');
  }
  audio.onended = () => URL.revokeObjectURL(url);
  audio.onerror = () => URL.revokeObjectURL(url);
}

export async function playStoredTts() {
  if (!state.lastTtsData) { alert('No audio available to replay'); return; }
  const url = URL.createObjectURL(state.lastTtsData.blob);
  const audio = new Audio(url);
  audio.playsInline = true;
  audio.volume = 1.0;
  audio.load();
  await new Promise(r => setTimeout(r, 100));

  const btn = document.getElementById('replayTtsBtn');
  if (btn) { btn.textContent = '🔊 Playing…'; btn.disabled = true; }

  try { await audio.play(); }
  catch { alert('Audio playback blocked.\n\n• Turn off silent mode\n• Increase volume\n• Try Chrome'); }

  const reset = () => {
    URL.revokeObjectURL(url);
    if (btn) { btn.textContent = '🔊 Play Audio'; btn.disabled = false; }
  };
  audio.onended = reset;
  audio.onerror = reset;
}
