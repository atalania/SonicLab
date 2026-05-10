/**
 * `js/dom.js` runs `document.getElementById` and `fitCanvas` at import time.
 * Install minimal elements so Vitest can load UI modules without a real index.html.
 *
 * jsdom does not ship a real Canvas2D implementation (`getContext` is null / throws).
 * `storage.js` loads thumbnails via `Image`, which can hang without a decode path.
 */

function installCanvas2dPolyfill() {
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (!proto) return;

  proto.toDataURL = function toDataURLPolyfill() {
    return 'data:image/png;base64,AAAA';
  };

  proto.getContext = function getContextPolyfill(type) {
    if (type !== '2d') return null;
    return {
      canvas: this,
      setTransform: () => {},
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      resetTransform: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
      getImageData: () => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      setLineDash: () => {},
      lineWidth: 1,
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: '',
      globalAlpha: 1,
    };
  };
}

function installFastImage() {
  globalThis.Image = class ImageMock {
    constructor() {
      this.width = 1;
      this.height = 1;
    }

    set src(_v) {
      queueMicrotask(() => {
        if (typeof this.onload === 'function') this.onload();
      });
    }
  };
}

installCanvas2dPolyfill();
installFastImage();

const CANVAS_IDS = new Set([
  'liveCanvas',
  'mysteryCanvas',
  'analysisSpectrogram',
  'analysisSpectrum',
]);

const INPUT_IDS = new Set(['wordInput', 'modalWordInput']);

const IDS = [
  'liveCanvas',
  'mysteryCanvas',
  'gallery',
  'gallery-empty',
  'word-hint',
  'recording-indicator',
  'spectrum-badge',
  'startBtn',
  'captureBtn',
  'wordInput',
  'goToChallengeBtn',
  'resetLabBtn',
  'backToLabBtn',
  'lab-section',
  'challenge-section',
  'options-container',
  'feedback',
  'nextBtn',
  'challenge-hint',
  'hint-text',
  'talkBtn',
  'studentTranscript',
  'aiReply',
  'nextQ',
  'diff',
  'pts',
  'count',
  'progress-bar',
  'stats-bar',
  'stat-words',
  'stat-score',
  'stat-difficulty',
  'stat-last-oral',
  'stat-last-delta',
  'meter-hint',
  'ai-percent',
  'ai-meter-bar',
  'ai-match-text',
  'autoBtn',
  'labelModal',
  'modalWordInput',
  'modalSaveBtn',
  'modalRetryBtn',
  'modalCancelBtn',
  'freq-axis',
  'live-readout',
  'live-pitch',
  'live-centroid',
  'live-energy',
  'live-flatness',
  'live-bandwidth',
  'live-rolloff',
  'analysisModal',
  'analysis-word-title',
  'analysis-close-btn',
  'analysisSpectrogram',
  'analysisSpectrum',
  'analysis-features',
  'analysis-bands',
  'analysis-dominant-freqs',
  'analysis-educational',
  'analysis-ai-text',
  'tutorial-overlay',
  'tutorial-close',
  'tutorial-step-meta',
  'tutorial-title',
  'tutorial-body',
  'tutorial-try-block',
  'tutorial-try',
  'tutorial-prev',
  'tutorial-next',
  'tutorial-nudge',
  'tutorial-nudge-start',
  'tutorial-nudge-dismiss',
  'header-tutorial-btn',
  'challenge-tutorial-btn',
  'question-coach',
  'question-coach-toggle',
  'question-coach-panel',
  'question-coach-content',
  'question-coach-open-tutorial',
];

function installDomFixture() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.id = 'test-root';
  document.body.appendChild(root);

  for (const id of IDS) {
    let el;
    if (CANVAS_IDS.has(id)) {
      el = document.createElement('canvas');
      el.width = 320;
      el.height = 180;
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          width: 320,
          height: 180,
          top: 0,
          left: 0,
          right: 320,
          bottom: 180,
          x: 0,
          y: 0,
        }),
      });
    } else if (INPUT_IDS.has(id)) {
      el = document.createElement('input');
      el.type = 'text';
    } else if (id.endsWith('Btn') || id === 'talkBtn' || id === 'question-coach-toggle') {
      el = document.createElement('button');
    } else {
      el = document.createElement('div');
    }
    el.id = id;
    if (id === 'challenge-section') el.style.display = 'none';
    if (id === 'lab-section') el.style.display = '';
    if (id === 'stats-bar') el.style.display = 'none';
    if (id === 'live-readout') el.style.display = 'none';
    root.appendChild(el);
  }
}

installDomFixture();
