import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { openLabelModal, closeLabelModal } from '../js/capture.js';

describe('capture modal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    el.labelModal.classList.remove('visible');
    el.modalWordInput.value = 'x';
    el.modalWordInput.focus = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('openLabelModal shows overlay and focuses input', () => {
    openLabelModal();
    expect(el.labelModal.classList.contains('visible')).toBe(true);
    expect(el.modalWordInput.value).toBe('');
    vi.advanceTimersByTime(150);
    expect(el.modalWordInput.focus).toHaveBeenCalled();
  });

  it('closeLabelModal hides overlay', () => {
    el.labelModal.classList.add('visible');
    closeLabelModal();
    expect(el.labelModal.classList.contains('visible')).toBe(false);
  });
});
