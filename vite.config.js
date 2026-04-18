import { defineConfig } from 'vitest/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const gameData = require('./data/game.json');

/** Node can inject a minimal `localStorage` via `--localstorage-file` (often invalid in CI/IDE), which breaks jsdom. Strip it for test workers only. */
function vitestEnvWithoutBrokenLocalStorage() {
  const raw = process.env.NODE_OPTIONS;
  if (!raw || typeof raw !== 'string') return {};
  const stripped = raw
    .replace(/\s*--localstorage-file(?:=\S*)?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped === raw.trim()) return {};
  return { NODE_OPTIONS: stripped };
}

export default defineConfig({
  base: `/staticGames/${gameData['game-id']}/`,
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  test: {
    environment: 'jsdom',
    env: vitestEnvWithoutBrokenLocalStorage(),
    setupFiles: ['./tests/setup-localstorage.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['js/**/*.js'],
      exclude: ['tests/**']
    }
  }
});
