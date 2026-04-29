import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { createRequire } from 'module';
import { createOpenAiDevProxy } from './vite-openai-dev-proxy.js';

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const openAiKey = (env.OPENAI_API_KEY || '').trim();
  const openAiOrg = (env.OPENAI_ORG_ID || '').trim();

  const proxyHeaders = {};
  if (openAiOrg) proxyHeaders['OpenAI-Organization'] = openAiOrg;

  return {
    base: `/staticGames/${gameData['game-id']}/`,
    server: {
      // When OPENAI_API_KEY is set in `.env.local`, handle `/api/ai/*` inside
      // Vite (no separate backend). Otherwise forward to localhost:3000 for a
      // host-provided portal API (production-like dev).
      ...(openAiKey
        ? {}
        : {
            proxy: {
              '/api': 'http://localhost:3000',
            },
          }),
      configureServer(server) {
        if (!openAiKey) return;
        server.middlewares.use(createOpenAiDevProxy(openAiKey, proxyHeaders));
      },
    },
    test: {
      environment: 'jsdom',
      env: vitestEnvWithoutBrokenLocalStorage(),
      setupFiles: ['./tests/setup-localstorage.js', './tests/setup-dom.js'],
      include: ['tests/**/*.test.js'],
      coverage: {
        provider: 'v8',
        reportsDirectory: 'coverage',
        reporter: ['text', 'html', 'lcov', 'json-summary'],
        include: ['js/**/*.js'],
        exclude: ['tests/**'],
      },
    },
  };
});
