export const state = {
  audioCtx: null,
  analyser: null,
  dataArray: null,
  floatFreqData: null,
  floatTimeData: null,
  linearMags: null,
  spectrumBuffer: null,
  liveFeatures: null,
  lastBinsShown: 0,

  library: [],
  currentTarget: null,
  isMicActive: false,
  score: 0,
  totalRounds: 0,
  dialogHistory: [],
  difficulty: 1,
  points: 0,

  recordingStream: null,
  mediaRecorder: null,
  audioChunks: [],
  ttsUnlocked: false,
  unlockCtx: null,
  lastTtsData: null,

  pendingCapture: null,

  autoCapture: {
    enabled: false,
    inSpeech: false,
    speechFrames: 0,
    silenceFrames: 0,
    // `null` = uninitialized; first VAD frame seeds it directly. Any other
    // numeric value (including 0) is a real EWMA baseline and gets smoothed.
    baseline: null,
    peak: 0,
    cooldownUntil: 0
  }
};
