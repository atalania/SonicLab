import { defineConfig } from 'vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const gameData = require('./data/game.json');

export default defineConfig({
  base: `/staticGames/${gameData['game-id']}/`,
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
