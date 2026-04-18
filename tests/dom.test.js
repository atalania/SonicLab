import { describe, it, expect } from 'vitest';
import { fitCanvas, isLabMode, el } from '../js/dom.js';

describe('dom', () => {
  it('fitCanvas sizes canvas from layout and applies DPR transform', () => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    Object.defineProperty(c, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
      }),
    });
    fitCanvas(c, ctx);
    expect(c.width).toBeGreaterThan(0);
    expect(c.height).toBeGreaterThan(0);
  });

  it('isLabMode is true unless challenge section is flex', () => {
    el.challengeSection.style.display = 'none';
    expect(isLabMode()).toBe(true);
    el.challengeSection.style.display = 'flex';
    expect(isLabMode()).toBe(false);
    el.challengeSection.style.display = 'none';
  });
});
