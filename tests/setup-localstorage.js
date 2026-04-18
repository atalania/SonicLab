/**
 * Node can expose a broken global `localStorage` when `--localstorage-file` is set
 * (even with an invalid path). That object may omit `setItem` / `getItem` / `removeItem`.
 * Install a minimal Web Storage implementation before any test modules load.
 */
class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this._data = new Map();
  }

  get length() {
    return this._data.size;
  }

  key(index) {
    const keys = [...this._data.keys()];
    return keys[index] ?? null;
  }

  getItem(key) {
    const k = String(key);
    return this._data.has(k) ? this._data.get(k) : null;
  }

  setItem(key, value) {
    this._data.set(String(key), String(value));
  }

  removeItem(key) {
    this._data.delete(String(key));
  }

  clear() {
    this._data.clear();
  }
}

function installMemoryLocalStorage() {
  const mem = new MemoryStorage();
  const desc = { value: mem, configurable: true, writable: true };

  try {
    delete globalThis.localStorage;
  } catch {
    /* ignore */
  }
  Object.defineProperty(globalThis, 'localStorage', desc);

  const win = globalThis.window;
  if (win && win !== globalThis) {
    try {
      delete win.localStorage;
    } catch {
      /* ignore */
    }
    Object.defineProperty(win, 'localStorage', desc);
  }
}

installMemoryLocalStorage();
