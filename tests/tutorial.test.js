import { describe, it, expect } from 'vitest';
import { getQuestionCoaching } from '../js/tutorial.js';

describe('getQuestionCoaching', () => {
  it('matches loudness questions', () => {
    const cards = getQuestionCoaching('What happens when you speak the same word louder?');
    expect(cards.some(c => /loudness/i.test(c.title))).toBe(true);
  });

  it('matches frequency-band questions', () => {
    const cards = getQuestionCoaching('Which frequency range shows the most energy in this pattern?');
    expect(cards.some(c => /frequency/i.test(c.title))).toBe(true);
  });

  it('matches pitch and harmonic questions', () => {
    const cards = getQuestionCoaching('Explain the relationship between the fundamental frequency and harmonics.');
    expect(cards.some(c => /pitch/i.test(c.title))).toBe(true);
  });

  it('returns a default coaching card for unknown prompts', () => {
    const cards = getQuestionCoaching('Tell me about the weather today.');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].title).toMatch(/how to answer/i);
  });
});
