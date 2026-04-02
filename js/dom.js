const $ = id => document.getElementById(id);

export const el = {
  liveCanvas:          $('liveCanvas'),
  mysteryCanvas:       $('mysteryCanvas'),
  gallery:             $('gallery'),
  galleryEmpty:        $('gallery-empty'),
  wordHint:            $('word-hint'),
  recordingIndicator:  $('recording-indicator'),
  spectrumBadge:       $('spectrum-badge'),
  startBtn:            $('startBtn'),
  captureBtn:          $('captureBtn'),
  wordInput:           $('wordInput'),
  goToChallengeBtn:    $('goToChallengeBtn'),
  resetLabBtn:         $('resetLabBtn'),
  backToLabBtn:        $('backToLabBtn'),
  labSection:          $('lab-section'),
  challengeSection:    $('challenge-section'),
  optionsContainer:    $('options-container'),
  feedback:            $('feedback'),
  nextBtn:             $('nextBtn'),
  challengeHint:       $('challenge-hint'),
  hintText:            $('hint-text'),
  talkBtn:             $('talkBtn'),
  studentTranscript:   $('studentTranscript'),
  aiReply:             $('aiReply'),
  nextQ:               $('nextQ'),
  diff:                $('diff'),
  pts:                 $('pts'),
  count:               $('count'),
  progressBar:         $('progress-bar'),
  statsBar:            $('stats-bar'),
  statWords:           $('stat-words'),
  statScore:           $('stat-score'),
  statDifficulty:      $('stat-difficulty'),
  aiPercent:           $('ai-percent'),
  aiMeterBar:          $('ai-meter-bar'),
  aiMatchText:         $('ai-match-text'),
  autoBtn:             $('autoBtn'),
  labelModal:          $('labelModal'),
  modalWordInput:      $('modalWordInput'),
  modalSaveBtn:        $('modalSaveBtn'),
  modalRetryBtn:       $('modalRetryBtn'),
  modalCancelBtn:      $('modalCancelBtn'),

  freqAxis:            $('freq-axis'),
  liveReadout:         $('live-readout'),
  livePitch:           $('live-pitch'),
  liveCentroid:        $('live-centroid'),
  liveEnergy:          $('live-energy'),
  liveFlatness:        $('live-flatness'),
  liveBandwidth:       $('live-bandwidth'),
  liveRolloff:         $('live-rolloff'),

  analysisModal:       $('analysisModal'),
  analysisWordTitle:   $('analysis-word-title'),
  analysisCloseBtn:    $('analysis-close-btn'),
  analysisSpectrogram: $('analysisSpectrogram'),
  analysisSpectrum:    $('analysisSpectrum'),
  analysisFeatures:    $('analysis-features'),
  analysisBands:       $('analysis-bands'),
  analysisDominant:    $('analysis-dominant-freqs'),
  analysisEducational: $('analysis-educational'),
  analysisAiText:      $('analysis-ai-text'),
};

export const liveCtx    = el.liveCanvas.getContext('2d', { willReadFrequently: true });
export const mysteryCtx = el.mysteryCanvas.getContext('2d');

export function fitCanvas(canvas, ctx) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function isLabMode() {
  return el.challengeSection.style.display !== 'flex';
}

fitCanvas(el.liveCanvas, liveCtx);
fitCanvas(el.mysteryCanvas, mysteryCtx);
