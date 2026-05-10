import { el } from '../dom.js';
import { openTutorial } from './flow.js';

const NUDGE_KEY = 'sonic-lab-tutorial-nudge-dismissed';

export function wireNudge() {
  if (!el.tutorialNudge) return;
  if (localStorage.getItem(NUDGE_KEY)) return;
  el.tutorialNudge.classList.remove('hidden');
  el.tutorialNudgeDismiss?.addEventListener('click', () => {
    localStorage.setItem(NUDGE_KEY, '1');
    el.tutorialNudge.classList.add('hidden');
  });
  el.tutorialNudgeStart?.addEventListener('click', () => {
    localStorage.setItem(NUDGE_KEY, '1');
    el.tutorialNudge.classList.add('hidden');
    openTutorial(0);
  });
}
