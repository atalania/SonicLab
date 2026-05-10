import { el } from '../dom.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setAnalysisText(text) {
  el.analysisAiText.textContent = '';
  if (!text) return;

  const header = document.createElement('strong');
  header.textContent = 'AI Analysis';
  header.style.fontFamily = 'var(--font-mono)';
  header.style.fontSize = '.62rem';
  header.style.letterSpacing = '.12em';
  header.style.display = 'block';
  header.style.marginBottom = '6px';
  header.style.color = 'var(--muted)';
  header.style.textTransform = 'uppercase';

  const body = document.createElement('span');
  body.textContent = String(text);
  body.style.whiteSpace = 'pre-line';

  el.analysisAiText.append(header, body);
}
