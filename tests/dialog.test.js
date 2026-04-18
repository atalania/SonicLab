import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { unlockAudioForiOS, startRecording, stopRecordingAndSend } from '../js/dialog.js';

describe('dialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.ttsUnlocked = false;
    state.unlockCtx = null;
    state.currentTarget = null;
    state.mediaRecorder = null;
    state.recordingStream = null;
    state.audioChunks = [];
    el.aiReply.textContent = '';
    el.talkBtn.disabled = false;
    el.talkBtn.textContent = '🎙️ Hold to Talk';
    el.talkBtn.className = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('unlockAudioForiOS marks unlocked after silent buffer playback', async () => {
    class Buf {
      getChannelData() {
        return new Float32Array(1);
      }
    }
    class Src {
      buffer = null;
      connect() {}
      start() {}
    }
    class AC {
      state = 'suspended';
      async resume() {
        this.state = 'running';
      }
      createBuffer() {
        return new Buf();
      }
      createBufferSource() {
        return new Src();
      }
      get destination() {
        return {};
      }
    }
    globalThis.AudioContext = AC;
    globalThis.webkitAudioContext = undefined;
    await unlockAudioForiOS();
    expect(state.ttsUnlocked).toBe(true);
  });

  it('startRecording exits when challenge target is missing', async () => {
    state.currentTarget = null;
    await startRecording();
    expect(el.aiReply.textContent).toMatch(/Challenge Mode/i);
    vi.advanceTimersByTime(200);
  });

  it('stopRecordingAndSend resets UI when not recording', async () => {
    state.mediaRecorder = null;
    await stopRecordingAndSend();
    expect(el.talkBtn.textContent).toContain('Hold to Talk');
  });

  it('stopRecordingAndSend warns when audio blob is too small', async () => {
    state.currentTarget = { word: 'W', features: {} };
    state.mediaRecorder = {
      state: 'recording',
      mimeType: 'audio/webm',
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => this.onstop?.());
      },
    };
    state.audioChunks = [new Blob([new Uint8Array(10)], { type: 'audio/webm' })];
    await stopRecordingAndSend();
    expect(el.aiReply.textContent).toMatch(/didn|catch|louder/i);
  });
});
