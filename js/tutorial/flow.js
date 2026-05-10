import { el } from '../dom.js';
import { STEPS } from './steps-data.js';

let stepIndex = 0;
let quizAnswered = false;

function clearSpotlight() {
  document.querySelectorAll('.tutorial-spotlight').forEach(n => n.classList.remove('tutorial-spotlight'));
}

function spotlightSelector(sel) {
  clearSpotlight();
  if (!sel) return;
  const node = document.querySelector(sel);
  if (node) {
    node.classList.add('tutorial-spotlight');
    try {
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch { /* ignore */ }
  }
}

function renderQuiz(host, quiz) {
  host.innerHTML = '';
  const feedback = document.createElement('p');
  feedback.className = 'tutorial-quiz-feedback';
  feedback.hidden = true;

  quiz.choices.forEach((choice) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn tutorial-quiz-btn';
    b.textContent = choice.label;
    b.addEventListener('click', () => {
      if (quizAnswered) return;
      quizAnswered = true;
      feedback.hidden = false;
      feedback.textContent = choice.correct ? quiz.win : quiz.lose;
      feedback.className = `tutorial-quiz-feedback ${choice.correct ? 'ok' : 'warn'}`;
      host.querySelectorAll('.tutorial-quiz-btn').forEach(btn => { btn.disabled = true; });
    });
    host.appendChild(b);
  });
  host.appendChild(feedback);
}

function renderStep() {
  const step = STEPS[stepIndex];
  const total = STEPS.length;
  el.tutorialStepMeta.textContent = `Step ${stepIndex + 1} of ${total}`;
  el.tutorialTitle.textContent = step.title;
  el.tutorialBody.innerHTML = step.body;

  const quizHost = el.tutorialBody.querySelector('#tutorial-quiz-host');
  if (quizHost && step.quiz) {
    quizAnswered = false;
    renderQuiz(quizHost, step.quiz);
  }

  if (step.tryText) {
    el.tutorialTry.textContent = step.tryText;
    el.tutorialTryBlock.classList.remove('hidden');
  } else {
    el.tutorialTryBlock.classList.add('hidden');
  }

  spotlightSelector(step.highlight);

  el.tutorialPrev.disabled = stepIndex === 0;
  el.tutorialNext.textContent = stepIndex >= total - 1 ? 'Done' : 'Next →';

  if (!step.tryText) {
    try {
      el.tutorialNext.focus();
    } catch { /* ignore */ }
  }
}

export function openTutorial(at = 0) {
  stepIndex = Math.max(0, Math.min(at, STEPS.length - 1));
  quizAnswered = false;
  el.tutorialOverlay.classList.remove('hidden');
  renderStep();
}

export function closeTutorial() {
  el.tutorialOverlay.classList.add('hidden');
  clearSpotlight();
}

export function tutorialGoPrev() {
  if (stepIndex <= 0) return;
  stepIndex--;
  renderStep();
}

/** @returns {boolean} true if closed after last step */
export function tutorialGoNext() {
  if (stepIndex >= STEPS.length - 1) {
    closeTutorial();
    return true;
  }
  stepIndex++;
  renderStep();
  return false;
}
