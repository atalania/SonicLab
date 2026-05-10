import { dialog as callDialog } from '../ai.js';
import { state } from '../state.js';
import { el } from '../dom.js';
import { updateStats } from '../ui.js';
import { saveToLocalStorage } from '../storage.js';
import { refreshQuestionHelper } from '../tutorial.js';
import {
  isSpeechApiAvailable,
  hasActiveWebSpeech,
  startWebSpeech,
  stopWebSpeech,
  recognitionLastError,
} from './web-speech.js';

let startInFlight = false;
let pendingStop = false;

async function ensureRecordingStream() {
  if (state.recordingStream) return state.recordingStream;
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

function explainRecordingFailure(err) {
  const name = String(err?.name || '').toLowerCase();
  if (!window.isSecureContext) return '❌ Recording needs HTTPS (secure context).';
  if (name === 'notallowederror' || name === 'securityerror') {
    return '❌ Mic blocked by browser settings or iframe permission policy (allow microphone).';
  }
  if (name === 'notfounderror') return '❌ No microphone device detected.';
  if (name === 'notreadableerror' || name === 'aborterror') {
    return '❌ Microphone unavailable. Close other apps using the mic and retry.';
  }
  return '❌ Couldn\'t start recording. Check mic permissions.';
}

export async function startRecording() {
  if (!state.currentTarget) {
    el.aiReply.textContent = 'Enter Challenge Mode first to use the AI quiz.';
    return;
  }
  if (state.mediaRecorder?.state === 'recording') return;
  if (hasActiveWebSpeech()) return;
  if (startInFlight) return;

  startInFlight = true;
  pendingStop = false;
  el.talkBtn.disabled = true;
  el.talkBtn.textContent = '🎙️ Recording…';
  el.talkBtn.classList.add('recording');
  state.audioChunks = [];

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
    el.aiReply.textContent = explainRecordingFailure(err);
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

  if (hasActiveWebSpeech()) {
    el.talkBtn.disabled = true;
    el.talkBtn.textContent = '⏳ Thinking…';
    el.talkBtn.classList.remove('recording');

    const transcript = await stopWebSpeech();
    if (!transcript) {
      resetTalkButton();
      if (recognitionLastError === 'not-allowed' || recognitionLastError === 'service-not-allowed') {
        el.aiReply.textContent = 'Speech recognition is blocked by browser/site permissions. Allow microphone and speech input for this site, then try again.';
      } else if (recognitionLastError === 'audio-capture') {
        el.aiReply.textContent = 'No usable microphone input detected. Check mic access and iframe microphone permissions.';
      } else {
        el.aiReply.textContent = 'I didn\'t catch that — try speaking a bit louder.';
      }
      return;
    }
    await runDialogTurn(null, transcript);
    return;
  }

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
    eligibleMcVoiceBonus: state.eligibleMcVoiceBonus,
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
    let replyText = data.reply || '(no reply)';
    if (data.usedLocalGrader) {
      replyText += '\n\n— Offline: scored with a simple local checker until the tutor API is available again.';
    }
    el.aiReply.textContent = replyText;
    el.nextQ.textContent = data.nextQuestion || '—';
    refreshQuestionHelper();

    state.difficulty = data.difficulty ?? state.difficulty;
    state.points     = data.totalPoints ?? state.points;
    state.eligibleMcVoiceBonus = false;
    state.lastOralScore = typeof data.score === 'number' ? data.score : state.lastOralScore;
    state.lastPointsDelta = typeof data.pointsDelta === 'number' ? data.pointsDelta : null;

    el.diff.textContent = state.difficulty;
    el.pts.textContent  = state.points;

    if (data.transcript) state.dialogHistory.push({ role: 'user', content: data.transcript });
    if (data.reply) state.dialogHistory.push({ role: 'assistant', content: data.reply });

    updateStats();
    saveToLocalStorage();
  } catch (err) {
    console.error('Dialog error:', err);
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
