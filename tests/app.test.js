import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { el } from '../js/dom.js';
import { state } from '../js/state.js';

vi.mock('../js/storage.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadFromLocalStorage: vi.fn(async () => null),
  };
});

describe('app wiring', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const reload = vi.fn();
  let confirmSpy;

  beforeAll(async () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('location', { ...window.location, reload });
    await import('../js/app.js');
    await Promise.resolve();
    await Promise.resolve();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  it('toggles auto capture and resets VAD counters', () => {
    el.autoBtn.click();
    expect(state.autoCapture.enabled).toBe(true);
    expect(el.autoBtn.textContent).toMatch(/ON/);
    el.autoBtn.click();
    expect(state.autoCapture.enabled).toBe(false);
    expect(el.autoBtn.textContent).toMatch(/OFF/);
  });

  it('modal retry clears pending capture', () => {
    state.pendingCapture = { img: document.createElement('canvas') };
    el.modalRetryBtn.click();
    expect(state.pendingCapture).toBeNull();
    expect(el.labelModal.classList.contains('visible')).toBe(false);
  });

  it('modal cancel restores capture controls', () => {
    state.pendingCapture = {};
    state.autoCapture.enabled = true;
    el.modalCancelBtn.click();
    expect(state.pendingCapture).toBeNull();
    expect(state.autoCapture.enabled).toBe(false);
    expect(el.captureBtn.disabled).toBe(false);
  });

  it('modal save warns when word is empty', () => {
    el.modalWordInput.value = '   ';
    el.modalSaveBtn.click();
    expect(window.alert).toHaveBeenCalled();
  });

  it('reset button respects cancelled confirm', () => {
    confirmSpy.mockReturnValueOnce(false);
    el.resetLabBtn.click();
    expect(reload).not.toHaveBeenCalled();
  });

  it('closes analysis modal from backdrop click', () => {
    el.analysisModal.classList.add('visible');
    const ev = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(ev, 'target', { value: el.analysisModal, enumerable: true });
    el.analysisModal.dispatchEvent(ev);
    expect(el.analysisModal.classList.contains('visible')).toBe(false);
  });

  it('analysis close button hides modal', () => {
    el.analysisModal.classList.add('visible');
    el.analysisCloseBtn.click();
    expect(el.analysisModal.classList.contains('visible')).toBe(false);
  });
});
