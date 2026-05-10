import { el, isLabMode } from '../dom.js';
import { getQuestionCoaching } from './question-coaching.js';
import { openTutorial } from './flow.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Refresh the expandable coach under “Next Question” (Challenge Mode). */
export function refreshQuestionHelper() {
  if (!el.questionCoachPanel || !el.questionCoachContent) return;
  const q = el.nextQ?.textContent || '';
  if (!q.trim() || /^answer questions by voice/i.test(q)) {
    el.questionCoachContent.innerHTML = '<p class="question-coach__empty">A question will appear here after you pick the correct mystery word and use Hold to Talk, or at the start of a round.</p>';
    return;
  }
  const cards = getQuestionCoaching(q);
  el.questionCoachContent.innerHTML = cards
    .map(
      c => `<article class="concept-card"><h4 class="concept-card__title">${escapeHtml(c.title)}</h4><p class="concept-card__text">${escapeHtml(c.text)}</p></article>`
    )
    .join('');
}

export function wireQuestionCoach() {
  el.questionCoachToggle?.addEventListener('click', () => {
    const panel = el.questionCoachPanel;
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    el.questionCoachToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) refreshQuestionHelper();
  });
  el.questionCoachOpenTutorial?.addEventListener('click', () => {
    if (el.questionCoachPanel) el.questionCoachPanel.hidden = true;
    el.questionCoachToggle?.setAttribute('aria-expanded', 'false');
    openTutorial(0);
  });
}

export function wireQuestionTextObserver() {
  if (typeof MutationObserver === 'undefined' || !el.nextQ) return;
  const mo = new MutationObserver(() => {
    if (!isLabMode() && el.questionCoachPanel && !el.questionCoachPanel.hidden) refreshQuestionHelper();
  });
  mo.observe(el.nextQ, { characterData: true, childList: true, subtree: true });
}
