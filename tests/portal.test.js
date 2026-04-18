import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../js/state.js';
import {
  fireLabStart,
  fireCaptureComplete,
  fireDatasetComplete,
  fireChallengeCorrect,
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
    expect(msg.payload.gameId).toBe('sonic-fingerprint-lab');
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
});
