import { el } from '../dom.js';
import { wireNudge } from './nudge.js';
import { wireQuestionCoach, refreshQuestionHelper, wireQuestionTextObserver } from './coach-panel.js';
import { openTutorial, closeTutorial, tutorialGoPrev, tutorialGoNext } from './flow.js';

export function initTutorial() {
  wireNudge();
  wireQuestionCoach();
  wireQuestionTextObserver();

  const go = () => openTutorial(0);
  el.headerTutorialBtn?.addEventListener('click', go);
  el.challengeTutorialBtn?.addEventListener('click', go);

  el.tutorialClose?.addEventListener('click', closeTutorial);

  el.tutorialPrev?.addEventListener('click', tutorialGoPrev);

  el.tutorialNext?.addEventListener('click', () => {
    tutorialGoNext();
  });

  document.addEventListener('keydown', e => {
    if (el.tutorialOverlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTutorial();
    }
    if (e.key === 'ArrowRight' && !el.tutorialNext.disabled) {
      e.preventDefault();
      el.tutorialNext.click();
    }
    if (e.key === 'ArrowLeft' && !el.tutorialPrev.disabled) {
      e.preventDefault();
      el.tutorialPrev.click();
    }
  });

  refreshQuestionHelper();
}
