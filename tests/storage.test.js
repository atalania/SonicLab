import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearSavedData, loadFromLocalStorage, saveToLocalStorage } from '../js/storage.js';
import { state } from '../js/state.js';

const STORAGE_KEY = 'sonic-fingerprint-lab-data';

/** Works with jsdom Storage and with the in-memory shim from `setup-localstorage.js`. */
function resetLocalStorage() {
  try {
    if (typeof localStorage?.clear === 'function') {
      localStorage.clear();
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage?.key === 'function' && typeof localStorage?.length === 'number') {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) {
        if (typeof localStorage.removeItem === 'function') localStorage.removeItem(k);
      }
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage?.removeItem === 'function') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetLocalStorage();
  state.library.length = 0;
  state.score = 0;
  state.difficulty = 1;
  state.points = 0;
  state.lastOralScore = null;
  state.lastPointsDelta = null;
  state.dialogHistory.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('clearSavedData', () => {
  it('removes persisted snapshot', () => {
    localStorage.setItem(STORAGE_KEY, '{}');
    clearSavedData();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('loadFromLocalStorage', () => {
  it('returns null when nothing saved', async () => {
    expect(await loadFromLocalStorage()).toBeNull();
  });

  it('returns null and clears storage for unsupported version', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, library: [] }));
    expect(await loadFromLocalStorage()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null when JSON is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    expect(await loadFromLocalStorage()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('loadFromLocalStorage (integration)', () => {
  it('rehydrates a v2 snapshot with canvas thumbnails', async () => {
    const payload = {
      version: 2,
      library: [
        {
          word: 'OK',
          imgDataUrl: TINY_PNG,
          freq: Array.from({ length: 64 }, (_, i) => (i * 3) % 256),
          magnitudes: null,
          features: null,
          analysis: 'saved',
          timestamp: '10:00:00',
        },
      ],
      score: 1,
      difficulty: 2,
      points: 3,
      dialogHistory: [{ role: 'user', content: 'hi' }],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    const data = await loadFromLocalStorage();
    expect(data).not.toBeNull();
    expect(data.items.length).toBe(1);
    expect(data.items[0].word).toBe('OK');
    expect(data.score).toBe(1);
    expect(data.dialogHistory.length).toBe(1);
  });
});

describe('saveToLocalStorage', () => {
  it('alerts when quota is exceeded', () => {
    state.library.push({
      word: 'BIG',
      img: { toDataURL: () => 'data:image/png;base64,AAAA' },
      freq: new Uint8Array([1]),
      magnitudes: null,
      features: null,
      analysis: '',
      timestamp: 't',
    });
    const err = new Error('quota');
    err.name = 'QuotaExceededError';
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw err;
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    saveToLocalStorage();
    expect(alertSpy).toHaveBeenCalled();
  });

  it('serializes library rows to localStorage', () => {
    state.score = 4;
    state.difficulty = 2;
    state.points = 7;
    state.lastOralScore = 0.72;
    state.lastPointsDelta = 4;
    state.library.push({
      word: 'HI',
      img: { toDataURL: () => 'data:image/png;base64,AAAA' },
      freq: new Uint8Array([1, 2, 3]),
      magnitudes: new Float32Array([0.1, 0.2]),
      features: { spectralCentroid: 1 },
      analysis: 'note',
      timestamp: 1,
    });
    saveToLocalStorage();
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw);
    expect(data.version).toBe(2);
    expect(data.library[0].word).toBe('HI');
    expect(data.score).toBe(4);
    expect(data.difficulty).toBe(2);
    expect(data.points).toBe(7);
    expect(data.lastOralScore).toBe(0.72);
    expect(data.lastPointsDelta).toBe(4);
  });
});
