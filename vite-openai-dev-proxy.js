/**
 * Dev-only proxy: forwards `/api/ai/openai` + `/api/ai/openai/whisper` to OpenAI.
 * Loaded from vite.config.js only when OPENAI_API_KEY is set in `.env.local`.
 * The browser never sees the key (same-origin fetch hits Vite; Vite calls OpenAI).
 */

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_WHISPER = 'https://api.openai.com/v1/audio/transcriptions';

export function createOpenAiDevProxy(apiKey, extraHeaders = {}) {
  return async function openAiDevProxy(req, res, next) {
    const pathname = req.url?.split('?')[0] || '';

    if (req.method !== 'POST') return next();

    const headersIn = {
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    };

    try {
      if (pathname === '/api/ai/openai') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        const upstream = await fetch(OPENAI_CHAT, {
          method: 'POST',
          headers: {
            ...headersIn,
            'Content-Type': req.headers['content-type'] || 'application/json',
          },
          body,
        });

        const text = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.end(text);
        return;
      }

      if (pathname === '/api/ai/openai/whisper') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        const ct = req.headers['content-type'];
        const upstream = await fetch(OPENAI_WHISPER, {
          method: 'POST',
          headers: {
            ...headersIn,
            ...(ct ? { 'Content-Type': ct } : {}),
          },
          body,
        });

        const text = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.end(text);
        return;
      }
    } catch (err) {
      console.error('[openai-dev-proxy]', err);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: String(err.message || err) }));
      return;
    }

    next();
  };
}
