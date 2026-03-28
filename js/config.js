export const API_URL    = 'https://soniclab-zoa0.onrender.com/analyze-sound';
export const DIALOG_URL = 'https://soniclab-zoa0.onrender.com/dialog';

export const FFT_SIZE  = 2048;
export const SMOOTHING = 0.3;

export const FREQ_BANDS = [
  { name: 'Sub-bass',   range: [20, 80],      color: '#ff2d78' },
  { name: 'Bass',       range: [80, 250],     color: '#ff6b35' },
  { name: 'Low-mid',    range: [250, 500],    color: '#ffaa00' },
  { name: 'Mid',        range: [500, 2000],   color: '#39ff14' },
  { name: 'Upper-mid',  range: [2000, 4000],  color: '#00e5ff' },
  { name: 'Presence',   range: [4000, 6000],  color: '#6366f1' },
  { name: 'Brilliance', range: [6000, 20000], color: '#a855f7' }
];
