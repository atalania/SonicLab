export function clampInt(x, lo, hi, def) {
  const v = parseInt(x, 10);
  return isNaN(v) ? def : Math.max(lo, Math.min(hi, v));
}

export function clampFloat(x, lo, hi, def) {
  const v = parseFloat(x);
  return isNaN(v) ? def : Math.max(lo, Math.min(hi, v));
}

export function truncate(s, n) {
  return s != null ? String(s).slice(0, n) : '';
}

export function stripCodeFences(s) {
  s = (s || '').trim();
  if (s.startsWith('```')) {
    const parts = s.split('```');
    if (parts.length >= 2) {
      s = parts[1].trim();
      if (s.startsWith('json')) s = s.slice(4).trim();
    }
  }
  return s.trim();
}

export function buildApiUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const base = (import.meta?.env?.BASE_URL || '/').replace(/\/+$/, '');
  if (!clean) return `${base || '/'}/`;
  if (!base || base === '/') return `/${clean}`;
  return `${base}/${clean}`;
}

export function getApiCandidates(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const primary = `/${clean}`;
  const secondary = buildApiUrl(clean);
  return primary === secondary ? [primary] : [primary, secondary];
}

export function safeParseJson(s) {
  try {
    return [true, JSON.parse(stripCodeFences(s))];
  } catch {
    return [false, {}];
  }
}

/** Pull quiz JSON even if the model wrapped it in prose or used a single ```json fence. */
export function parseQuizPayload(raw) {
  const text = stripCodeFences(raw || '').trim();
  if (!text) return null;
  try {
    const o = JSON.parse(text);
    if (o && typeof o.reply === 'string') return o;
  } catch { /* try brace extraction */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1));
      if (o && typeof o.reply === 'string') return o;
    } catch { /* ignore */ }
  }
  return null;
}

export function isIdk(text) {
  let t = (text || '').trim().toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = [
    "i don't know", "i dont know", "idk", "no idea", "not sure",
    "i'm not sure", "im not sure", "i forgot", "can't remember",
    "cant remember", "i dunno", "dont know"
  ];
  return phrases.some(p => t.includes(p));
}
