import { state } from '../state.js';
import { el } from '../dom.js';
import { updateProgress, updateStats } from '../ui.js';
import { saveToLocalStorage } from '../storage.js';
import { showAnalysisModal } from './analysis-modal.js';

export function addToGallery(word, snapCanvas, index) {
  if (el.galleryEmpty) el.galleryEmpty.style.display = 'none';

  const card = document.createElement('div');
  card.className = 'capture-card';
  card.setAttribute('data-index', index);

  const del = document.createElement('button');
  del.className = 'card-del';
  del.textContent = '×';
  del.addEventListener('click', e => {
    e.stopPropagation();
    deleteCapture(Number(card.getAttribute('data-index')));
  });

  const mini = document.createElement('canvas');
  mini.width = 140; mini.height = 60;
  mini.getContext('2d').drawImage(snapCanvas, 0, 0, 140, 60);

  const wl = document.createElement('div');
  wl.className = 'capture-card__word';
  wl.textContent = word;

  const ts = document.createElement('div');
  ts.className = 'capture-card__time';
  ts.textContent = state.library[index].timestamp;

  card.append(del, mini, wl, ts);
  card.addEventListener('click', () => showAnalysisModal(Number(card.getAttribute('data-index'))));

  el.gallery.appendChild(card);
}

function deleteCapture(index) {
  if (!confirm(`Delete "${state.library[index]?.word}" from dataset?`)) return;
  state.library.splice(index, 1);

  const cardEl = el.gallery.querySelector(`[data-index="${index}"]`);
  if (cardEl) cardEl.remove();

  [...el.gallery.querySelectorAll('.capture-card')].forEach((c, i) => c.setAttribute('data-index', i));

  if (state.library.length === 0 && el.galleryEmpty) el.galleryEmpty.style.display = 'block';

  if (state.currentTarget && !state.library.includes(state.currentTarget)) {
    el.challengeSection.style.display = 'none';
    el.labSection.style.display = '';
    state.currentTarget = null;
  }

  updateProgress();
  updateStats();
  saveToLocalStorage();
}
