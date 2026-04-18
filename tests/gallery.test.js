import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { addToGallery, showAnalysisModal, closeAnalysisModal } from '../js/gallery.js';

function makeItem(word, withFeatures = true) {
  const img = document.createElement('canvas');
  img.width = 32;
  img.height = 16;
  img.getContext('2d').fillRect(0, 0, 32, 16);
  const mags = new Float32Array(256);
  for (let i = 10; i < 80; i++) mags[i] = 0.02 + i * 0.0001;
  return {
    word,
    img,
    freq: new Uint8Array(128).fill(5),
    magnitudes: mags,
    features: withFeatures
      ? {
          pitchHz: 180,
          spectralCentroid: 1400,
          spectralBandwidth: 350,
          spectralRolloff: 2800,
          spectralFlatness: 0.06,
          rmsDb: -22,
          zcr: 0.03,
          pitchClarity: 0.6,
          dominantFreqs: [{ freq: 400, magnitude: 2 }],
          formants: [{ freq: 500, magnitude: 1 }, { freq: 1800, magnitude: 1 }],
          bandEnergies: [
            { name: 'Mid', pct: 35, range: [500, 2000], color: '#39ff14' },
            { name: 'Bass', pct: 25, range: [80, 250], color: '#ff6b35' },
          ],
        }
      : null,
    analysis: 'AI wrote this.',
    timestamp: '09:41:00',
  };
}

describe('gallery', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });
    state.library.length = 0;
    el.gallery.innerHTML = '';
    if (el.galleryEmpty) el.galleryEmpty.style.display = 'block';
    el.analysisModal.classList.remove('visible');
  });

  it('addToGallery renders a card and hides empty state', () => {
    state.library.push(makeItem('ONE'));
    addToGallery('ONE', state.library[0].img, 0);
    expect(el.gallery.querySelectorAll('.capture-card').length).toBe(1);
    if (el.galleryEmpty) expect(el.galleryEmpty.style.display).toBe('none');
  });

  it('showAnalysisModal fills fields when features exist', () => {
    state.library.push(makeItem('TWO', true));
    showAnalysisModal(0);
    expect(el.analysisModal.classList.contains('visible')).toBe(true);
    expect(el.analysisWordTitle.textContent).toContain('TWO');
    expect(el.analysisFeatures.innerHTML.length).toBeGreaterThan(20);
  });

  it('showAnalysisModal handles missing features gracefully', () => {
    state.library.push(makeItem('THREE', false));
    showAnalysisModal(0);
    expect(el.analysisFeatures.textContent).toMatch(/not available|re-capture/i);
  });

  it('closeAnalysisModal hides overlay', () => {
    el.analysisModal.classList.add('visible');
    closeAnalysisModal();
    expect(el.analysisModal.classList.contains('visible')).toBe(false);
  });
});
