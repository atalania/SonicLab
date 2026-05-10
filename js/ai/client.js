import { AI_MODEL } from './constants.js';
import { getApiCandidates } from './utils.js';

export async function callAI(messages, { maxTokens = 320, temperature = 0.2, requireJson = false } = {}) {
  const body = {
    model: AI_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (requireJson) body.response_format = { type: 'json_object' };

  let lastError = null;
  for (const url of getApiCandidates('api/ai/openai')) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.choices?.[0]?.message?.content || '').trim();
    }

    let detail = '';
    try {
      const text = await res.text();
      detail = text ? `: ${String(text).slice(0, 180)}` : '';
    } catch {
      detail = '';
    }
    lastError = new Error(`AI proxy returned ${res.status}${detail}`);
    if (res.status !== 404) break;
  }
  throw lastError || new Error('AI proxy failed');
}
