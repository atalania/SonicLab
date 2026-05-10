import { state } from '../state.js';

export async function unlockAudioForiOS() {
  if (state.ttsUnlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!state.unlockCtx) state.unlockCtx = new AC();
      if (state.unlockCtx.state === 'suspended') await state.unlockCtx.resume();
      const buf = state.unlockCtx.createBuffer(1, 1, 22050);
      const src = state.unlockCtx.createBufferSource();
      src.buffer = buf;
      src.connect(state.unlockCtx.destination);
      src.start(0);
    }
    state.ttsUnlocked = true;
  } catch (err) {
    console.warn('unlockAudioForiOS: failed (will retry on next gesture):', err);
  }
}
