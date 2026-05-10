import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../js/state.js';
import {
  fireLabStart,
  fireCaptureComplete,
  fireDatasetComplete,
  fireChallengeCorrect,
  fireChallengeStart,
  fireChallengeIncorrect,
  fireHintViewed,
  initPortal,
} from '../js/portal.js';

describe('portal bridge (integration)', () => {
  let postMessage;
  let fakeParent;

  beforeEach(() => {
    postMessage = vi.fn();
    fakeParent = { postMessage };
    Object.defineProperty(window, 'parent', {
      value: fakeParent,
      configurable: true,
      writable: true,
    });
    state.library.length = 0;
    state.currentTarget = null;
    state.totalRounds = 0;
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', {
      value: window,
      configurable: true,
      writable: true,
    });
  });

  it('posts ASSISTANT_GAME_EVENT with level_start payload', () => {
    fireLabStart();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = postMessage.mock.calls[0][0];
    expect(msg.type).toBe('ASSISTANT_GAME_EVENT');
    expect(msg.payload.gameId).toBe('sonic-lab');
    expect(msg.payload.eventType).toBe('level_start');
    expect(msg.payload.levelId).toBe('lab');
  });

  it('includes spectral context on capture events', () => {
    fireCaptureComplete('HELLO', {
      pitchHz: 120,
      spectralCentroid: 900,
      spectralBandwidth: 400,
      spectralFlatness: 0.1,
      rmsDb: -20,
    });
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.eventType).toBe('correct_submission');
    expect(msg.payload.playerAnswer).toBe('HELLO');
    expect(msg.payload.additionalContext.spectralCentroid).toBe(900);
  });

  it('reports dataset size on dataset complete', () => {
    state.library.push({ word: 'A' }, { word: 'B' });
    fireDatasetComplete();
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.eventType).toBe('level_complete');
    expect(msg.payload.additionalContext.wordsCollected).toBe(2);
    expect(msg.payload.additionalContext.words).toEqual(['A', 'B']);
  });

  it('includes correctAnswer on challenge correct when target is set', () => {
    state.currentTarget = { word: 'CAT' };
    state.totalRounds = 3;
    fireChallengeCorrect('CAT');
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.eventType).toBe('correct_submission');
    expect(msg.payload.correctAnswer).toBe('CAT');
    expect(msg.payload.levelId).toContain('challenge');
  });

  it('posts challenge start with round-specific level id', () => {
    fireChallengeStart(2);
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.eventType).toBe('level_start');
    expect(msg.payload.levelId).toBe('challenge-round-2');
    expect(msg.payload.targetConcept).toBe('spectral_pattern_recognition');
  });

  it('posts incorrect_submission with mistake metadata', () => {
    state.currentTarget = { word: 'DOG' };
    state.totalRounds = 1;
    fireChallengeIncorrect('CAT', 'DOG');
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.eventType).toBe('incorrect_submission');
    expect(msg.payload.playerAnswer).toBe('CAT');
    expect(msg.payload.correctAnswer).toBe('DOG');
    expect(msg.payload.mistakeCategory).toBe('spectral_confusion');
  });

  it('posts incorrect_submission with optional additionalContext', () => {
    state.currentTarget = { word: 'DOG' };
    state.totalRounds = 1;
    fireChallengeIncorrect('CAT', 'DOG', { spectralHint: 'Centroid is high', autoFeedbackShown: true });
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.additionalContext.spectralHint).toBe('Centroid is high');
    expect(msg.payload.additionalContext.autoFeedbackShown).toBe(true);
  });

  it('increments hintCount across hint_request events', () => {
    fireChallengeStart(1);
    postMessage.mockClear();
    fireHintViewed();
    fireHintViewed();
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[0][0].payload.hintCount).toBe(1);
    expect(postMessage.mock.calls[1][0].payload.hintCount).toBe(2);
  });

  it('omits additionalContext when capture has no feature object', () => {
    fireCaptureComplete('WORD', null);
    const msg = postMessage.mock.calls[0][0];
    expect(msg.payload.playerAnswer).toBe('WORD');
    expect(msg.payload.additionalContext).toBeUndefined();
  });
});

describe('portal standalone (integration)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'parent', {
      value: window,
      configurable: true,
      writable: true,
    });
  });

  it('logs bridge traffic when not embedded', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    fireLabStart();
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();
  });
});

describe('initPortal', () => {
  let postMessage;

  beforeEach(() => {
    vi.useFakeTimers();
    postMessage = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'parent', {
      value: window,
      configurable: true,
      writable: true,
    });
  });

  it('registers idle timer and fires timeout event', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    initPortal();
    expect(addSpy).toHaveBeenCalled();
    vi.advanceTimersByTime(120_000);
    expect(postMessage).toHaveBeenCalled();
    const idleMsg = postMessage.mock.calls.find(
      c => c[0]?.payload?.eventType === 'timeout',
    );
    expect(idleMsg).toBeTruthy();
    addSpy.mockRestore();
  });
});
