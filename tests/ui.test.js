import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { showStatus, updateProgress, updateStats, updateMeter } from '../js/ui.js';

beforeEach(() => {
  state.library.length = 0;
  state.score = 0;
  state.difficulty = 1;
  state.points = 0;
  state.lastOralScore = null;
  state.lastPointsDelta = null;
  el.wordHint.textContent = '';
  el.wordHint.className = '';
  el.count.textContent = '0';
  el.statWords.textContent = '0';
  el.progressBar.style.width = '0%';
  el.goToChallengeBtn.disabled = false;
  el.goToChallengeBtn.style.boxShadow = '';
  el.statScore.textContent = '0';
  el.statDifficulty.textContent = '1';
  el.statLastOral.textContent = '—';
  el.statLastDelta.textContent = '—';
  el.pts.textContent = '0';
  el.aiPercent.textContent = '0';
  el.aiMeterBar.style.width = '0%';
  el.aiMatchText.textContent = '';
  el.aiMatchText.style.color = '';
});

describe('ui', () => {
  it('showStatus sets hint text and loading class', () => {
    showStatus('Hello', 'info');
    expect(el.wordHint.textContent).toBe('Hello');
    expect(el.wordHint.classList.contains('loading')).toBe(false);
    showStatus('Wait', 'loading');
    expect(el.wordHint.classList.contains('loading')).toBe(true);
  });

  it('updateProgress reflects library size and unlocks challenge at 4', () => {
    for (let i = 0; i < 3; i++) state.library.push({ word: `W${i}` });
    updateProgress();
    expect(el.count.textContent).toBe('3');
    expect(el.goToChallengeBtn.disabled).toBe(true);
    state.library.push({ word: 'W3' });
    updateProgress();
    expect(el.goToChallengeBtn.disabled).toBe(false);
    expect(el.wordHint.textContent).toMatch(/Dataset complete/i);
  });

  it('updateStats copies score, difficulty, points, and last voice summary', () => {
    state.score = 12;
    state.difficulty = 4;
    state.points = 99;
    state.lastOralScore = 0.815;
    state.lastPointsDelta = 5;
    updateStats();
    expect(el.statScore.textContent).toBe('12');
    expect(el.statDifficulty.textContent).toBe('4');
    expect(el.pts.textContent).toBe('99');
    expect(el.statLastOral.textContent).toBe('82%');
    expect(el.statLastDelta.textContent).toBe('+5');
  });

  it('updateMeter updates label colors by match strength', () => {
    updateMeter(90);
    expect(el.aiMatchText.textContent).toMatch(/STRONG/i);
    updateMeter(60);
    expect(el.aiMatchText.textContent).toMatch(/PARTIAL/i);
    updateMeter(30);
    expect(el.aiMatchText.textContent).toMatch(/WEAK/i);
    updateMeter(5);
    expect(el.aiMatchText.textContent).toMatch(/NO MATCH/i);
  });
});
